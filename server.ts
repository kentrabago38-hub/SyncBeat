import crypto from 'crypto';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildAccentPattern,
  DEFAULT_CLICK_PROFILE,
  DEFAULT_PRESETS,
  DEFAULT_SETLISTS,
} from './src/constants/metronomeData.ts';
import {
  deleteLiveSessionFromDb,
  getLiveSessionFromDb,
  getOrCreateUser,
  getSharedLibrary,
  getUserLibrary,
  getUserSessionConfig,
  pruneExpiredLiveSessions,
  upsertLiveSessionInDb,
  upsertSharedLibrary,
  upsertUserLibrary,
  upsertUserSessionConfig,
} from './src/db/repository.ts';
import type { PersistedSessionConfigPayload } from './src/db/schema.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import {
  BeatAccentType,
  ClickSoundId,
  CountInBars,
  MetronomePreset,
  MetronomeSessionState,
  MusicianRole,
  Participant,
  RemotePermissions,
  Setlist,
  SetlistItem,
  StageSignalMessage,
  SubdivisionType,
  TimeSignature,
} from './src/types/metronome.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerSession {
  state: MetronomeSessionState;
  hostUid: string | null;
  hostToken: string;
  participantTokens: Map<string, string>;
  kickedIds: Set<string>;
  sockets: Map<string, WebSocket>;
  pendingSignals: Map<string, StageSignalMessage[]>;
  automationTimer: NodeJS.Timeout | null;
}

function persistSessionToDb(session: ServerSession): void {
  const participantTokens: Record<string, string> = {};
  for (const [k, v] of session.participantTokens.entries()) {
    participantTokens[k] = v;
  }
  void upsertLiveSessionInDb({
    sessionId: session.state.sessionId,
    hostUid: session.hostUid,
    hostToken: session.hostToken,
    state: session.state,
    participantTokens,
    kickedIds: Array.from(session.kickedIds),
    ended: false,
  }).catch((err) => {
    console.error('Failed to persist live session:', err);
  });
}

async function getOrHydrateSession(code: string, forceRefresh = false): Promise<ServerSession | null> {
  const clean = code.toUpperCase().trim();
  const cached = sessions.get(clean);
  if (cached && !forceRefresh) return cached;

  try {
    const dbRecord = await getLiveSessionFromDb(clean);
    if (dbRecord?.ended) {
      sessions.delete(clean);
      return null;
    }
    if (!dbRecord) return cached ?? null;
    const tokenMap = new Map<string, string>(Object.entries(dbRecord.participantTokens || {}));
    if (cached) {
      cached.state = dbRecord.state;
      cached.hostUid = dbRecord.hostUid;
      cached.hostToken = dbRecord.hostToken;
      for (const [k, v] of tokenMap.entries()) {
        cached.participantTokens.set(k, v);
      }
      for (const kicked of dbRecord.kickedIds || []) {
        cached.kickedIds.add(kicked);
      }
      return cached;
    }
    const hydrated: ServerSession = {
      state: dbRecord.state,
      hostUid: dbRecord.hostUid,
      hostToken: dbRecord.hostToken,
      participantTokens: tokenMap,
      kickedIds: new Set(dbRecord.kickedIds || []),
      sockets: new Map(),
      pendingSignals: new Map(),
      automationTimer: null,
    };
    sessions.set(clean, hydrated);
    return hydrated;
  } catch {
    return cached ?? null;
  }
}

async function tryBuildRehydratedServerSession(
  code: string,
  participantId: string | undefined,
  token: string | undefined,
  rehydrateState: unknown
): Promise<ServerSession | null> {
  if (!participantId || !token || !rehydrateState || typeof rehydrateState !== 'object') {
    return null;
  }
  const clean = code.toUpperCase().trim();
  try {
    const dbRecord = await getLiveSessionFromDb(clean);
    if (dbRecord?.ended) {
      return null;
    }
  } catch {
    // ignore DB check error during fallback recovery
  }
  const candidate = rehydrateState as MetronomeSessionState;
  if (
    typeof candidate.sessionId !== 'string' ||
    candidate.sessionId.toUpperCase().trim() !== clean ||
    !Array.isArray(candidate.participants)
  ) {
    return null;
  }
  const hasParticipant = candidate.participants.some((p) => p && p.id === participantId);
  if (!hasParticipant) {
    return null;
  }
  const tokenMap = new Map<string, string>();
  tokenMap.set(participantId, token);
  const restored: ServerSession = {
    state: { ...candidate, sessionId: clean, lastActivityAt: Date.now() },
    hostUid: null,
    hostToken: candidate.hostId === participantId ? token : '',
    participantTokens: tokenMap,
    kickedIds: new Set(),
    sockets: new Map(),
    pendingSignals: new Map(),
    automationTimer: null,
  };
  sessions.set(clean, restored);
  if (restored.state.playback.isPlaying) {
    scheduleNextAutomation(restored);
  }
  persistSessionToDb(restored);
  return restored;
}

const sessions = new Map<string, ServerSession>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSessionCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    if (!sessions.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
}

function clampBpm(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 120;
  return Math.round(Math.min(300, Math.max(20, num)) * 10) / 10;
}

function sanitizeText(val: unknown, maxLen: number, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeRole(val: unknown): MusicianRole {
  const valid: MusicianRole[] = ['Keyboard', 'Guitar', 'Bass', 'Drums', 'Vocals', 'Piano', 'Other'];
  return valid.includes(val as MusicianRole) ? (val as MusicianRole) : 'Other';
}

function getCurrentTotalBeats(state: MetronomeSessionState, nowMs: number): number {
  if (!state.playback.isPlaying) return state.playback.anchorTotalBeats;
  const dt = Math.max(0, nowMs - state.playback.anchorServerMs);
  return state.playback.anchorTotalBeats + (dt / 60000) * state.bpm;
}

function clearAutomationTimer(session: ServerSession): void {
  if (session.automationTimer) {
    clearTimeout(session.automationTimer);
    session.automationTimer = null;
  }
}

function scheduleNextAutomation(session: ServerSession): void {
  clearAutomationTimer(session);
  const state = session.state;
  if (!state.playback.isPlaying || state.setlist.length === 0) return;

  const song = state.setlist[state.activeSongIndex];
  if (!song) return;

  const beatsPerBar = Math.max(1, state.timeSignature.numerator);
  const countInBeats = state.countInBars * beatsPerBar;
  const now = Date.now();
  const currentTotalBeats = getCurrentTotalBeats(state, now);
  const songBeatsElapsed = currentTotalBeats - countInBeats;

  // Check if song has tempoSections
  if (song.tempoSections && song.tempoSections.length > 0) {
    const idx = state.playback.activeSectionIndex;
    const activeSection = song.tempoSections[idx];
    if (activeSection && activeSection.bars > 0) {
      let targetBeatCumulative = 0;
      for (let i = 0; i <= idx; i++) {
        targetBeatCumulative += (song.tempoSections[i]?.bars ?? 0) * beatsPerBar;
      }
      const beatsUntilTransition = targetBeatCumulative - Math.max(0, songBeatsElapsed);
      if (beatsUntilTransition > 0) {
        const msUntil = (beatsUntilTransition / state.bpm) * 60000;
        session.automationTimer = setTimeout(() => {
          const nextIdx = idx + 1;
          if (song.tempoSections && nextIdx < song.tempoSections.length) {
            const tNow = Date.now();
            const tb = getCurrentTotalBeats(session.state, tNow);
            session.state.playback.anchorServerMs = tNow;
            session.state.playback.anchorTotalBeats = tb;
            session.state.playback.activeSectionIndex = nextIdx;
            session.state.playback.sequenceId += 1;
            session.state.bpm = clampBpm(song.tempoSections[nextIdx].bpm);
            broadcastState(session);
            scheduleNextAutomation(session);
          } else if (song.autoAdvance && state.activeSongIndex + 1 < state.setlist.length) {
            applySongSelection(session, state.activeSongIndex + 1, true);
            broadcastState(session);
          }
        }, Math.max(20, msUntil));
        return;
      }
    }
  }

  // Fallback: autoAdvance after song.bars
  if (song.autoAdvance && song.bars > 0 && state.activeSongIndex + 1 < state.setlist.length) {
    const targetSongBeats = song.bars * beatsPerBar;
    const beatsRemaining = targetSongBeats - Math.max(0, songBeatsElapsed);
    if (beatsRemaining > 0) {
      const msUntil = (beatsRemaining / state.bpm) * 60000;
      session.automationTimer = setTimeout(() => {
        applySongSelection(session, session.state.activeSongIndex + 1, true);
        broadcastState(session);
      }, Math.max(20, msUntil));
    }
  }
}

function applySongSelection(session: ServerSession, songIndex: number, keepPlaying: boolean): void {
  const state = session.state;
  const clamped = Math.max(0, Math.min(state.setlist.length - 1, songIndex));
  const song = state.setlist[clamped];
  if (!song) return;

  state.activeSongIndex = clamped;
  const startBpm =
    song.tempoSections && song.tempoSections.length > 0 ? song.tempoSections[0].bpm : song.bpm;
  state.bpm = clampBpm(startBpm);
  state.timeSignature = { ...song.timeSignature };
  state.subdivision = song.subdivision;
  state.accentPattern = [...song.accentPattern];
  state.countInBars = song.countInBars;
  state.clickProfile = {
    ...state.clickProfile,
    normalSound: song.clickSound,
  };
  state.playback.activeSectionIndex = 0;
  state.playback.anchorTotalBeats = 0;
  state.playback.sequenceId += 1;

  if (keepPlaying) {
    state.playback.isPlaying = true;
    state.playback.anchorServerMs = Date.now() + 110;
    scheduleNextAutomation(session);
  } else {
    state.playback.isPlaying = false;
    state.playback.anchorServerMs = Date.now();
    clearAutomationTimer(session);
  }
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastState(session: ServerSession): void {
  session.state.lastActivityAt = Date.now();
  const msg = JSON.stringify({ type: 'session:state', session: session.state });
  for (const ws of session.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
  persistSessionToDb(session);
}

function canControl(
  session: ServerSession,
  participantId: string,
  action: 'playStop' | 'bpm' | 'setlistNav' | 'hostOnly'
): boolean {
  if (participantId === session.state.hostId) return true;
  if (action === 'hostOnly') return false;
  const p = session.state.participants.find((m) => m.id === participantId);
  if (!p) return false;
  return Boolean(p.permissions[action]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    // Never emit wildcard CORS on authenticated /api/user/* routes
    if (!req.path.startsWith('/user')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, runtime: 'node-ws', serverTime: Date.now(), activeSessions: sessions.size });
  });

  app.get('/api/network-info', (req, res) => {
    const port = Number(process.env.PORT) || 3000;
    const reqProto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0].trim()
        : req.protocol || 'http';
    const interfaces = os.networkInterfaces();
    const candidates: Array<{ address: string; iface: string; url: string; likelyHotspot: boolean }> = [];

    for (const [iface, entries] of Object.entries(interfaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.family !== 'IPv4' || entry.internal) continue;
        const addr = entry.address;
        const likelyHotspot =
          addr.startsWith('172.20.10.') ||
          addr.startsWith('192.168.43.') ||
          addr.startsWith('192.168.137.') ||
          /ap|hotspot|wlan|p2p/i.test(iface);
        const portSuffix =
          (reqProto === 'https' && port === 443) || (reqProto === 'http' && port === 80)
            ? ''
            : `:${port}`;
        candidates.push({
          address: addr,
          iface,
          url: `${reqProto}://${addr}${portSuffix}`,
          likelyHotspot,
        });
      }
    }

    candidates.sort((a, b) => Number(b.likelyHotspot) - Number(a.likelyHotspot));
    res.json({
      runtime: 'node-ws',
      port,
      addresses: candidates,
    });
  });

  // Authenticated Cloud SQL persistence routes (Firebase Auth required)
  app.get('/api/user/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || '';
      const name = typeof req.user!.name === 'string' ? req.user!.name : null;
      await getOrCreateUser(uid, email, name);
      const [library, sessionConfig] = await Promise.all([
        getUserLibrary(uid),
        getUserSessionConfig(uid),
      ]);
      res.json({ ok: true, library, sessionConfig });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync user data',
      });
    }
  });

  app.put('/api/user/library', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || '';
      const name = typeof req.user!.name === 'string' ? req.user!.name : null;
      const { presets, setlists } = req.body as { presets?: unknown; setlists?: unknown };
      if (!Array.isArray(presets) || !Array.isArray(setlists)) {
        res.status(400).json({ error: 'Invalid presets or setlists payload' });
        return;
      }
      await getOrCreateUser(uid, email, name);
      await upsertUserLibrary(uid, presets as MetronomePreset[], setlists as Setlist[]);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save library',
      });
    }
  });

  app.put('/api/user/session-config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || '';
      const name = typeof req.user!.name === 'string' ? req.user!.name : null;
      const { config } = req.body as { config?: unknown };
      if (!config || typeof config !== 'object') {
        res.status(400).json({ error: 'Invalid session configuration payload' });
        return;
      }
      await getOrCreateUser(uid, email, name);
      await upsertUserSessionConfig(uid, config as PersistedSessionConfigPayload);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save session configuration',
      });
    }
  });

  app.get('/api/library', async (_req, res) => {
    try {
      const store = await getSharedLibrary();
      res.json(store);
    } catch {
      res.json({ presets: DEFAULT_PRESETS, setlists: DEFAULT_SETLISTS });
    }
  });

  app.put('/api/library/presets', async (req, res) => {
    const { presets } = req.body as { presets?: unknown };
    if (!Array.isArray(presets)) {
      res.status(400).json({ error: 'Invalid presets array' });
      return;
    }
    try {
      const current = await getSharedLibrary();
      const nextPresets = presets.slice(0, 100) as MetronomePreset[];
      await upsertSharedLibrary(nextPresets, current.setlists);
      res.json({ ok: true, presets: nextPresets });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save presets',
      });
    }
  });

  app.put('/api/library/setlists', async (req, res) => {
    const { setlists } = req.body as { setlists?: unknown };
    if (!Array.isArray(setlists)) {
      res.status(400).json({ error: 'Invalid setlists array' });
      return;
    }
    try {
      const current = await getSharedLibrary();
      const nextSetlists = setlists.slice(0, 50) as Setlist[];
      await upsertSharedLibrary(current.presets, nextSetlists);
      res.json({ ok: true, setlists: nextSetlists });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save setlists',
      });
    }
  });

  // Public session lookup for join prompt
  app.get('/api/sessions/:code', async (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const session = await getOrHydrateSession(code);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.json({
      sessionId: session.state.sessionId,
      name: session.state.name,
      hostName: session.state.hostName,
      hostRole: session.state.hostRole,
      bpm: session.state.bpm,
      timeSignature: session.state.timeSignature,
      participantCount: session.state.participants.length,
      isLocked: session.state.isLocked,
    });
  });

  // Create new session (Host)
  app.post('/api/sessions', async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ error: 'Invalid session request payload.' });
        return;
      }

      let hostUid: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
          hostUid = decoded.uid;
        } catch {
          // allow anonymous session hosting fallback if token invalid/absent
        }
      }
      const body = req.body as {
        name?: unknown;
        hostName?: unknown;
        hostRole?: unknown;
        bpm?: unknown;
        timeSignature?: TimeSignature;
        accentPattern?: BeatAccentType[];
        subdivision?: SubdivisionType;
        clickSound?: ClickSoundId;
        clickProfile?: Partial<MetronomeSessionState['clickProfile']>;
        countInBars?: CountInBars;
        setlist?: SetlistItem[];
        activeSetlistId?: string | null;
        activeSongIndex?: number;
      };

      const sessionId = generateSessionCode();
      const hostId = crypto.randomUUID();
      const hostToken = crypto.randomBytes(24).toString('hex');
      const hostName = sanitizeText(body.hostName, 32, 'Host');
      const hostRole = sanitizeRole(body.hostRole);
      const ts: TimeSignature = body.timeSignature?.numerator
        ? {
            numerator: Math.max(1, Math.min(16, Math.round(body.timeSignature.numerator))),
            denominator: ([2, 4, 8, 16].includes(body.timeSignature.denominator)
              ? body.timeSignature.denominator
              : 4) as 2 | 4 | 8 | 16,
            grouping: Array.isArray(body.timeSignature.grouping)
              ? body.timeSignature.grouping.slice(0, 8)
              : undefined,
          }
        : { numerator: 4, denominator: 4 };

      const now = Date.now();
      const hostParticipant: Participant = {
        id: hostId,
        name: hostName,
        role: hostRole,
        isHost: true,
        isMuted: false,
        status: 'synced',
        latencyMs: 0,
        permissions: { playStop: true, bpm: true, setlistNav: true },
        joinedAt: now,
      };

      const initialSetlist = Array.isArray(body.setlist)
        ? body.setlist.slice(0, 100)
        : DEFAULT_SETLISTS[0].items;

      const initialAccentPattern =
        Array.isArray(body.accentPattern) && body.accentPattern.length === ts.numerator
          ? (body.accentPattern.map((a) =>
              a === 'accent' || a === 'normal' || a === 'mute' ? a : 'normal'
            ) as BeatAccentType[])
          : buildAccentPattern(ts);

      const rawProfile =
        body.clickProfile && typeof body.clickProfile === 'object' ? body.clickProfile : {};
      const mergedProfile: MetronomeSessionState['clickProfile'] = {
        ...DEFAULT_CLICK_PROFILE,
        ...rawProfile,
        normalSound: rawProfile.normalSound ?? body.clickSound ?? DEFAULT_CLICK_PROFILE.normalSound,
      };

      const clampedSongIndex =
        initialSetlist.length > 0 && typeof body.activeSongIndex === 'number'
          ? Math.max(0, Math.min(initialSetlist.length - 1, Math.round(body.activeSongIndex)))
          : 0;

      const state: MetronomeSessionState = {
        sessionId,
        name: sanitizeText(body.name, 48, 'Band Rehearsal'),
        hostId,
        hostName,
        hostRole,
        isLocked: false,
        bpm: clampBpm(body.bpm ?? 120),
        timeSignature: ts,
        accentPattern: initialAccentPattern,
        subdivision: body.subdivision ?? 'quarter',
        clickProfile: mergedProfile,
        countInBars: body.countInBars ?? 0,
        playback: {
          isPlaying: false,
          anchorServerMs: now,
          anchorTotalBeats: 0,
          sequenceId: 1,
          activeSectionIndex: 0,
        },
        activeSetlistId:
          body.activeSetlistId !== undefined ? body.activeSetlistId : DEFAULT_SETLISTS[0].id,
        activeSongIndex: clampedSongIndex,
        setlist: initialSetlist,
        participants: [hostParticipant],
        createdAt: now,
        lastActivityAt: now,
      };

      const serverSession: ServerSession = {
        state,
        hostUid,
        hostToken,
        participantTokens: new Map([[hostId, hostToken]]),
        kickedIds: new Set(),
        sockets: new Map(),
        pendingSignals: new Map(),
        automationTimer: null,
      };

      sessions.set(sessionId, serverSession);
      try {
        await upsertLiveSessionInDb({
          sessionId: serverSession.state.sessionId,
          hostUid: serverSession.hostUid,
          hostToken: serverSession.hostToken,
          state: serverSession.state,
          participantTokens: { [hostId]: hostToken },
          kickedIds: [],
          ended: false,
        });
      } catch (err) {
        console.error('Failed to persist newly created live session:', err);
      }
      res.status(201).json({
        session: state,
        participantId: hostId,
        token: hostToken,
        serverTime: Date.now(),
      });
    } catch (error) {
      console.error('Unexpected error creating session:', error);
      res.status(500).json({
        error: 'Unable to initialize live session on the server. Please try again.',
      });
    }
  });

  // Join existing session (Participant)
  app.post('/api/sessions/:code/join', async (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const session = await getOrHydrateSession(code);
    if (!session) {
      res.status(404).json({ error: 'Session not found. Check the code and try again.' });
      return;
    }
    if (session.state.isLocked) {
      res.status(403).json({ error: 'This session is locked by the host.' });
      return;
    }

    const body = req.body as { name?: unknown; role?: unknown; replacesParticipantId?: unknown };
    const replacesId =
      typeof body.replacesParticipantId === 'string' ? body.replacesParticipantId.trim() : '';
    if (
      replacesId &&
      replacesId !== session.state.hostId &&
      !session.kickedIds.has(replacesId)
    ) {
      const existingWs = session.sockets.get(replacesId);
      if (!existingWs || existingWs.readyState !== WebSocket.OPEN) {
        session.sockets.delete(replacesId);
        session.participantTokens.delete(replacesId);
        session.state.participants = session.state.participants.filter((p) => p.id !== replacesId);
      }
    }

    const participantId = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    const role = sanitizeRole(body.role);
    const defaultName = `Musician ${session.state.participants.length}`;
    const name = sanitizeText(body.name, 32, defaultName);

    const participant: Participant = {
      id: participantId,
      name,
      role,
      isHost: false,
      isMuted: false,
      status: 'syncing',
      latencyMs: 0,
      permissions: { playStop: false, bpm: false, setlistNav: false },
      joinedAt: Date.now(),
    };

    session.participantTokens.set(participantId, token);
    session.state.participants.push(participant);
    broadcastState(session);

    const tokenObj: Record<string, string> = {};
    for (const [k, v] of session.participantTokens.entries()) {
      tokenObj[k] = v;
    }
    try {
      await upsertLiveSessionInDb({
        sessionId: session.state.sessionId,
        hostUid: session.hostUid,
        hostToken: session.hostToken,
        state: session.state,
        participantTokens: tokenObj,
        kickedIds: Array.from(session.kickedIds),
        ended: false,
      });
    } catch {
      // ignore fallback DB failure
    }

    res.status(201).json({
      session: session.state,
      participantId,
      token,
      serverTime: Date.now(),
    });
  });

  // HTTP state/clock synchronization fallback endpoint (mirrors /api/index.ts)
  app.post('/api/sessions/:code/sync', async (req, res) => {
    const serverRecvTime = Date.now();
    const code = req.params.code.toUpperCase().trim();
    const { participantId, token, latencyMs, status, rehydrateState } = req.body as {
      participantId?: string;
      token?: string;
      latencyMs?: number;
      status?: Participant['status'];
      rehydrateState?: unknown;
    };

    let session = await getOrHydrateSession(code);
    if (session && participantId && token && session.participantTokens.get(participantId) !== token) {
      session = await getOrHydrateSession(code, true);
    }
    if (!session && rehydrateState) {
      session = await tryBuildRehydratedServerSession(code, participantId, token, rehydrateState);
    }
    if (!session) {
      res.status(404).json({ error: 'Session not found', ended: false, rehydrateRequired: true });
      return;
    }
    if (participantId && session.kickedIds.has(participantId)) {
      res.status(403).json({ error: 'Removed by session host', kicked: true });
      return;
    }
    if (!participantId || !token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }
    if (session.participantTokens.get(participantId) !== token) {
      const isListedParticipant =
        !session.participantTokens.has(participantId) &&
        session.state.participants.some((m) => m.id === participantId);
      if (isListedParticipant) {
        session.participantTokens.set(participantId, token);
        persistSessionToDb(session);
      } else {
        res.status(401).json({ error: 'Unauthorized session token' });
        return;
      }
    }

    let dirty = false;
    const p = session.state.participants.find((m) => m.id === participantId);
    if (p) {
      if (typeof latencyMs === 'number' && Number.isFinite(latencyMs)) {
        const rounded = Math.max(0, Math.min(9999, Math.round(latencyMs)));
        if (p.latencyMs !== rounded) {
          p.latencyMs = rounded;
          dirty = true;
        }
      }
      if (status === 'synced' || status === 'syncing' || status === 'unstable' || status === 'offline') {
        if (p.status !== status) {
          p.status = status;
          dirty = true;
        }
      } else if (p.status === 'syncing') {
        p.status = 'synced';
        dirty = true;
      }
    }

    if (dirty) {
      broadcastState(session);
    }

    const nowMs = Date.now();
    const queued = (session.pendingSignals.get(participantId) ?? []).filter(
      (sig) => nowMs - sig.createdAt < 45_000
    );
    if (queued.length > 0) {
      session.pendingSignals.delete(participantId);
    }

    res.json({
      session: session.state,
      signals: queued,
      serverRecvTime,
      serverTime: Date.now(),
    });
  });

  // WebRTC Stage Mesh signaling relay endpoint (HTTP fallback when WS is unavailable)
  app.post('/api/sessions/:code/signal', async (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const body = req.body as Record<string, unknown>;
    const participantId = typeof body.participantId === 'string' ? body.participantId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const toParticipantId = typeof body.toParticipantId === 'string' ? body.toParticipantId : '';
    const kind = body.kind;

    let session = await getOrHydrateSession(code);
    if (session && participantId && token && session.participantTokens.get(participantId) !== token) {
      session = await getOrHydrateSession(code, true);
    }
    if (!session && body.rehydrateState) {
      session = await tryBuildRehydratedServerSession(code, participantId, token, body.rehydrateState);
    }
    if (!session) {
      res.status(404).json({ error: 'Session not found', ended: false, rehydrateRequired: true });
      return;
    }
    if (!participantId || !token || session.participantTokens.get(participantId) !== token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }
    if (
      !toParticipantId ||
      (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') ||
      !session.state.participants.some((p) => p.id === toParticipantId)
    ) {
      res.status(400).json({ error: 'Invalid target peer or signal type' });
      return;
    }

    const signal: StageSignalMessage = {
      id: crypto.randomUUID(),
      fromParticipantId: participantId,
      toParticipantId,
      kind,
      payload: body.payload,
      createdAt: Date.now(),
    };

    const targetWs = session.sockets.get(toParticipantId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      sendJson(targetWs, { type: 'webrtc:signal', signal });
    } else {
      const list = session.pendingSignals.get(toParticipantId) ?? [];
      list.push(signal);
      if (list.length > 30) list.shift();
      session.pendingSignals.set(toParticipantId, list);
    }

    res.json({ ok: true });
  });

  // HTTP command fallback endpoint (mirrors WebSocket commands)
  app.post('/api/sessions/:code/command', async (req, res) => {
    const serverRecvTime = Date.now();
    const code = req.params.code.toUpperCase().trim();
    const body = req.body as Record<string, unknown>;
    const participantId = typeof body.participantId === 'string' ? body.participantId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const type = typeof body.type === 'string' ? body.type : '';

    let session = await getOrHydrateSession(code);
    if (session && participantId && token && session.participantTokens.get(participantId) !== token) {
      session = await getOrHydrateSession(code, true);
    }
    if (!session) {
      res.status(404).json({ error: 'Session not found', ended: false });
      return;
    }
    if (!participantId || !token || session.participantTokens.get(participantId) !== token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }

    const state = session.state;
    const now = Date.now();

    switch (type) {
      case 'transport:play': {
        if (!canControl(session, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = true;
        state.playback.anchorServerMs = now + 110;
        state.playback.sequenceId += 1;
        scheduleNextAutomation(session);
        break;
      }

      case 'transport:pause': {
        if (!canControl(session, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const currentBeats = getCurrentTotalBeats(state, now);
        state.playback.isPlaying = false;
        state.playback.anchorTotalBeats = currentBeats;
        state.playback.anchorServerMs = now;
        state.playback.sequenceId += 1;
        clearAutomationTimer(session);
        break;
      }

      case 'transport:stop': {
        if (!canControl(session, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = false;
        state.playback.anchorTotalBeats = 0;
        state.playback.anchorServerMs = now;
        state.playback.activeSectionIndex = 0;
        state.playback.sequenceId += 1;
        clearAutomationTimer(session);
        break;
      }

      case 'transport:restart': {
        if (!canControl(session, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = true;
        state.playback.anchorTotalBeats = 0;
        state.playback.anchorServerMs = now + 110;
        state.playback.activeSectionIndex = 0;
        state.playback.sequenceId += 1;
        scheduleNextAutomation(session);
        break;
      }

      case 'metronome:update': {
        const patch = (body.patch ?? {}) as Record<string, unknown>;
        const changingBpmOnly = Object.keys(patch).every((k) => k === 'bpm');
        const allowed = changingBpmOnly
          ? canControl(session, participantId, 'bpm')
          : canControl(session, participantId, 'hostOnly');
        if (!allowed) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        if (patch.bpm !== undefined) {
          const newBpm = clampBpm(patch.bpm);
          if (state.playback.isPlaying) {
            state.playback.anchorTotalBeats = getCurrentTotalBeats(state, now);
            state.playback.anchorServerMs = now;
          }
          state.bpm = newBpm;
          state.playback.sequenceId += 1;
          scheduleNextAutomation(session);
        }

        if (patch.name !== undefined) {
          state.name = sanitizeText(patch.name, 48, state.name);
        }

        if (patch.isLocked !== undefined && canControl(session, participantId, 'hostOnly')) {
          state.isLocked = Boolean(patch.isLocked);
        }

        if (patch.timeSignature !== undefined) {
          const ts = patch.timeSignature as TimeSignature;
          if (ts && typeof ts.numerator === 'number') {
            state.timeSignature = {
              numerator: Math.max(1, Math.min(16, Math.round(ts.numerator))),
              denominator: ([2, 4, 8, 16].includes(ts.denominator) ? ts.denominator : 4) as 2 | 4 | 8 | 16,
              grouping: Array.isArray(ts.grouping) ? ts.grouping.slice(0, 8) : undefined,
            };
            if (!patch.accentPattern) {
              state.accentPattern = buildAccentPattern(state.timeSignature);
            }
            state.playback.sequenceId += 1;
          }
        }

        if (Array.isArray(patch.accentPattern)) {
          state.accentPattern = patch.accentPattern
            .slice(0, 16)
            .map((a) => (a === 'accent' || a === 'normal' || a === 'mute' ? a : 'normal')) as BeatAccentType[];
        }

        if (typeof patch.subdivision === 'string') {
          state.subdivision = patch.subdivision as SubdivisionType;
          state.playback.sequenceId += 1;
        }

        if (patch.clickProfile && typeof patch.clickProfile === 'object') {
          state.clickProfile = {
            ...state.clickProfile,
            ...(patch.clickProfile as Partial<MetronomeSessionState['clickProfile']>),
          };
        }

        if (patch.countInBars !== undefined) {
          const c = Number(patch.countInBars);
          if ([0, 1, 2, 4, 8].includes(c)) {
            state.countInBars = c as CountInBars;
            state.playback.sequenceId += 1;
          }
        }
        break;
      }

      case 'setlist:selectSong': {
        if (!canControl(session, participantId, 'setlistNav')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const idx = Number(body.index);
        if (Number.isFinite(idx)) {
          applySongSelection(session, idx, state.playback.isPlaying);
        }
        break;
      }

      case 'setlist:load': {
        if (!canControl(session, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        if (Array.isArray(body.items)) {
          state.setlist = (body.items as SetlistItem[]).slice(0, 100);
          if (typeof body.setlistId === 'string' || body.setlistId === null) {
            state.activeSetlistId = body.setlistId;
          }
          if (state.activeSongIndex >= state.setlist.length) {
            state.activeSongIndex = Math.max(0, state.setlist.length - 1);
          }
        }
        break;
      }

      case 'host:regenerateCode': {
        if (!canControl(session, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const oldId = state.sessionId;
        const newId = generateSessionCode();
        sessions.delete(oldId);
        state.sessionId = newId;
        sessions.set(newId, session);
        void deleteLiveSessionFromDb(oldId).catch(() => {});
        persistSessionToDb(session);
        const payload = JSON.stringify({ type: 'session:codeChanged', newSessionId: newId, session: state });
        for (const clientWs of session.sockets.values()) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(payload);
          }
        }
        res.json({ session: state, newSessionId: newId, serverRecvTime, serverTime: Date.now() });
        return;
      }

      case 'host:participantControl': {
        if (!canControl(session, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const targetId = typeof body.targetId === 'string' ? body.targetId : '';
        const action = body.action;
        if (targetId && targetId !== state.hostId) {
          if (action === 'remove') {
            state.participants = state.participants.filter((p) => p.id !== targetId);
            session.participantTokens.delete(targetId);
            session.kickedIds.add(targetId);
            const targetWs = session.sockets.get(targetId);
            if (targetWs) {
              sendJson(targetWs, { type: 'session:kicked', reason: 'Removed by session host' });
              targetWs.close();
              session.sockets.delete(targetId);
            }
          } else if (action === 'toggleMute') {
            const p = state.participants.find((m) => m.id === targetId);
            if (p) p.isMuted = !p.isMuted;
          } else if (
            action === 'setPermissions' &&
            body.permissions &&
            typeof body.permissions === 'object'
          ) {
            const p = state.participants.find((m) => m.id === targetId);
            if (p) {
              const perms = body.permissions as Partial<RemotePermissions>;
              p.permissions = {
                playStop: Boolean(perms.playStop ?? p.permissions.playStop),
                bpm: Boolean(perms.bpm ?? p.permissions.bpm),
                setlistNav: Boolean(perms.setlistNav ?? p.permissions.setlistNav),
              };
            }
          }
        }
        break;
      }

      case 'host:endSession': {
        if (!canControl(session, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        clearAutomationTimer(session);
        const endMsg = JSON.stringify({ type: 'session:ended' });
        for (const clientWs of session.sockets.values()) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(endMsg);
            clientWs.close();
          }
        }
        sessions.delete(state.sessionId);
        void deleteLiveSessionFromDb(state.sessionId).catch(() => {});
        res.json({ ended: true, serverRecvTime, serverTime: Date.now() });
        return;
      }

      default:
        res.status(400).json({ error: 'Unknown command' });
        return;
    }

    broadcastState(session);
    res.json({ session: state, serverRecvTime, serverTime: Date.now() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (reqUrl.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    let currentSessionRef: ServerSession | null = null;
    let boundParticipantId: string | null = null;

    ws.on('message', async (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (typeof type !== 'string') return;

      // High-priority NTP clock sync ping
      if (type === 'clock:ping') {
        const pingServerTime = Date.now();
        sendJson(ws, {
          type: 'clock:pong',
          clientSendTime: msg.clientSendTime,
          serverRecvTime: pingServerTime,
          serverTime: pingServerTime,
        });
        return;
      }

      if (type === 'auth') {
        const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId.toUpperCase().trim() : '';
        const participantId = typeof msg.participantId === 'string' ? msg.participantId : '';
        const token = typeof msg.token === 'string' ? msg.token : '';

        let session = await getOrHydrateSession(sessionId);
        if (session && (!session.participantTokens.get(participantId) || session.participantTokens.get(participantId) !== token)) {
          session = await getOrHydrateSession(sessionId, true);
        }
        if (!session) {
          sendJson(ws, { type: 'session:error', error: 'Session not found' });
          return;
        }

        const expectedToken = session.participantTokens.get(participantId);
        if (!expectedToken || expectedToken !== token) {
          sendJson(ws, { type: 'session:error', error: 'Unauthorized session token' });
          return;
        }

        currentSessionRef = session;
        boundParticipantId = participantId;
        session.sockets.set(participantId, ws);

        const p = session.state.participants.find((m) => m.id === participantId);
        if (p) {
          p.status = 'synced';
        }

        broadcastState(session);
        return;
      }

      if (!currentSessionRef || !boundParticipantId) return;
      const session = currentSessionRef;
      if (sessions.get(session.state.sessionId) !== session) return;

      const state = session.state;
      const now = Date.now();

      switch (type) {
        case 'client:metrics': {
          const p = state.participants.find((m) => m.id === boundParticipantId);
          if (p) {
            const latency = Number(msg.latencyMs);
            if (Number.isFinite(latency)) {
              p.latencyMs = Math.max(0, Math.min(9999, Math.round(latency)));
            }
            const status = msg.status;
            if (status === 'synced' || status === 'syncing' || status === 'unstable' || status === 'offline') {
              p.status = status;
            }
            broadcastState(session);
          }
          break;
        }

        case 'transport:play': {
          if (!canControl(session, boundParticipantId, 'playStop')) return;
          state.playback.isPlaying = true;
          state.playback.anchorServerMs = now + 110;
          state.playback.sequenceId += 1;
          scheduleNextAutomation(session);
          broadcastState(session);
          break;
        }

        case 'transport:pause': {
          if (!canControl(session, boundParticipantId, 'playStop')) return;
          const currentBeats = getCurrentTotalBeats(state, now);
          state.playback.isPlaying = false;
          state.playback.anchorTotalBeats = currentBeats;
          state.playback.anchorServerMs = now;
          state.playback.sequenceId += 1;
          clearAutomationTimer(session);
          broadcastState(session);
          break;
        }

        case 'transport:stop': {
          if (!canControl(session, boundParticipantId, 'playStop')) return;
          state.playback.isPlaying = false;
          state.playback.anchorTotalBeats = 0;
          state.playback.anchorServerMs = now;
          state.playback.activeSectionIndex = 0;
          state.playback.sequenceId += 1;
          clearAutomationTimer(session);
          broadcastState(session);
          break;
        }

        case 'transport:restart': {
          if (!canControl(session, boundParticipantId, 'playStop')) return;
          state.playback.isPlaying = true;
          state.playback.anchorTotalBeats = 0;
          state.playback.anchorServerMs = now + 110;
          state.playback.activeSectionIndex = 0;
          state.playback.sequenceId += 1;
          scheduleNextAutomation(session);
          broadcastState(session);
          break;
        }

        case 'metronome:update': {
          const patch = (msg.patch ?? {}) as Record<string, unknown>;
          const changingBpmOnly = Object.keys(patch).every((k) => k === 'bpm');
          const allowed = changingBpmOnly
            ? canControl(session, boundParticipantId, 'bpm')
            : canControl(session, boundParticipantId, 'hostOnly');
          if (!allowed) return;

          if (patch.bpm !== undefined) {
            const newBpm = clampBpm(patch.bpm);
            if (state.playback.isPlaying) {
              const currentBeats = getCurrentTotalBeats(state, now);
              state.playback.anchorTotalBeats = currentBeats;
              state.playback.anchorServerMs = now;
            }
            state.bpm = newBpm;
            state.playback.sequenceId += 1;
            scheduleNextAutomation(session);
          }

          if (patch.name !== undefined) {
            state.name = sanitizeText(patch.name, 48, state.name);
          }

          if (patch.isLocked !== undefined && canControl(session, boundParticipantId, 'hostOnly')) {
            state.isLocked = Boolean(patch.isLocked);
          }

          if (patch.timeSignature !== undefined) {
            const ts = patch.timeSignature as TimeSignature;
            if (ts && typeof ts.numerator === 'number') {
              state.timeSignature = {
                numerator: Math.max(1, Math.min(16, Math.round(ts.numerator))),
                denominator: ([2, 4, 8, 16].includes(ts.denominator) ? ts.denominator : 4) as 2 | 4 | 8 | 16,
                grouping: Array.isArray(ts.grouping) ? ts.grouping.slice(0, 8) : undefined,
              };
              if (!patch.accentPattern) {
                state.accentPattern = buildAccentPattern(state.timeSignature);
              }
              state.playback.sequenceId += 1;
            }
          }

          if (Array.isArray(patch.accentPattern)) {
            state.accentPattern = patch.accentPattern
              .slice(0, 16)
              .map((a) => (a === 'accent' || a === 'normal' || a === 'mute' ? a : 'normal')) as BeatAccentType[];
          }

          if (typeof patch.subdivision === 'string') {
            state.subdivision = patch.subdivision as SubdivisionType;
            state.playback.sequenceId += 1;
          }

          if (patch.clickProfile && typeof patch.clickProfile === 'object') {
            state.clickProfile = {
              ...state.clickProfile,
              ...(patch.clickProfile as Partial<MetronomeSessionState['clickProfile']>),
            };
          }

          if (patch.countInBars !== undefined) {
            const c = Number(patch.countInBars);
            if ([0, 1, 2, 4, 8].includes(c)) {
              state.countInBars = c as CountInBars;
              state.playback.sequenceId += 1;
            }
          }

          broadcastState(session);
          break;
        }

        case 'setlist:selectSong': {
          if (!canControl(session, boundParticipantId, 'setlistNav')) return;
          const idx = Number(msg.index);
          if (!Number.isFinite(idx)) return;
          applySongSelection(session, idx, state.playback.isPlaying);
          broadcastState(session);
          break;
        }

        case 'setlist:load': {
          if (!canControl(session, boundParticipantId, 'hostOnly')) return;
          if (Array.isArray(msg.items)) {
            state.setlist = (msg.items as SetlistItem[]).slice(0, 100);
            if (typeof msg.setlistId === 'string' || msg.setlistId === null) {
              state.activeSetlistId = msg.setlistId;
            }
            if (state.activeSongIndex >= state.setlist.length) {
              state.activeSongIndex = Math.max(0, state.setlist.length - 1);
            }
            broadcastState(session);
          }
          break;
        }

        case 'host:regenerateCode': {
          if (!canControl(session, boundParticipantId, 'hostOnly')) return;
          const oldId = state.sessionId;
          const newId = generateSessionCode();
          sessions.delete(oldId);
          state.sessionId = newId;
          sessions.set(newId, session);
          void deleteLiveSessionFromDb(oldId).catch(() => {});
          persistSessionToDb(session);
          const payload = JSON.stringify({ type: 'session:codeChanged', newSessionId: newId, session: state });
          for (const clientWs of session.sockets.values()) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(payload);
            }
          }
          break;
        }

        case 'host:participantControl': {
          if (!canControl(session, boundParticipantId, 'hostOnly')) return;
          const targetId = typeof msg.targetId === 'string' ? msg.targetId : '';
          const action = msg.action;
          if (!targetId || targetId === state.hostId) return;

          if (action === 'remove') {
            state.participants = state.participants.filter((p) => p.id !== targetId);
            session.participantTokens.delete(targetId);
            session.kickedIds.add(targetId);
            const targetWs = session.sockets.get(targetId);
            if (targetWs) {
              sendJson(targetWs, { type: 'session:kicked', reason: 'Removed by session host' });
              targetWs.close();
              session.sockets.delete(targetId);
            }
            broadcastState(session);
          } else if (action === 'toggleMute') {
            const p = state.participants.find((m) => m.id === targetId);
            if (p) {
              p.isMuted = !p.isMuted;
              broadcastState(session);
            }
          } else if (action === 'setPermissions' && msg.permissions && typeof msg.permissions === 'object') {
            const p = state.participants.find((m) => m.id === targetId);
            if (p) {
              const perms = msg.permissions as Partial<RemotePermissions>;
              p.permissions = {
                playStop: Boolean(perms.playStop ?? p.permissions.playStop),
                bpm: Boolean(perms.bpm ?? p.permissions.bpm),
                setlistNav: Boolean(perms.setlistNav ?? p.permissions.setlistNav),
              };
              broadcastState(session);
            }
          }
          break;
        }

        case 'webrtc:signal': {
          const toParticipantId = typeof msg.toParticipantId === 'string' ? msg.toParticipantId : '';
          const kind = msg.kind;
          if (
            !toParticipantId ||
            (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') ||
            !state.participants.some((p) => p.id === toParticipantId)
          ) {
            return;
          }
          const signal: StageSignalMessage = {
            id: crypto.randomUUID(),
            fromParticipantId: boundParticipantId,
            toParticipantId,
            kind,
            payload: msg.payload,
            createdAt: now,
          };
          const targetWs = session.sockets.get(toParticipantId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            sendJson(targetWs, { type: 'webrtc:signal', signal });
          } else {
            const list = session.pendingSignals.get(toParticipantId) ?? [];
            list.push(signal);
            if (list.length > 30) list.shift();
            session.pendingSignals.set(toParticipantId, list);
          }
          break;
        }

        case 'host:endSession': {
          if (!canControl(session, boundParticipantId, 'hostOnly')) return;
          clearAutomationTimer(session);
          const endMsg = JSON.stringify({ type: 'session:ended' });
          for (const clientWs of session.sockets.values()) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(endMsg);
              clientWs.close();
            }
          }
          sessions.delete(state.sessionId);
          void deleteLiveSessionFromDb(state.sessionId).catch(() => {});
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!currentSessionRef || !boundParticipantId) return;
      const session = currentSessionRef;
      if (sessions.get(session.state.sessionId) !== session) return;
      if (session.sockets.get(boundParticipantId) === ws) {
        session.sockets.delete(boundParticipantId);
        const p = session.state.participants.find((m) => m.id === boundParticipantId);
        if (p) {
          p.status = 'offline';
          broadcastState(session);
        }
      }
    });
  });

  // Periodic cleanup of stale sessions (> 4 hours inactive)
  setInterval(() => {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    for (const [id, session] of sessions.entries()) {
      if (session.state.lastActivityAt < cutoff && session.sockets.size === 0) {
        clearAutomationTimer(session);
        sessions.delete(id);
      }
    }
    void pruneExpiredLiveSessions(new Date(cutoff));
  }, 5 * 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SyncBeat server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
