import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildAccentPattern,
  DEFAULT_CLICK_PROFILE,
  DEFAULT_PRESETS,
  DEFAULT_SETLISTS,
} from './src/constants/metronomeData';
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
  SubdivisionType,
  TimeSignature,
} from './src/types/metronome';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_PATH = path.resolve(__dirname, '.syncbeat-store.json');

interface LibraryStore {
  presets: MetronomePreset[];
  setlists: Setlist[];
}

function loadStore(): LibraryStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LibraryStore>;
      return {
        presets: Array.isArray(parsed.presets) && parsed.presets.length > 0 ? parsed.presets : DEFAULT_PRESETS,
        setlists: Array.isArray(parsed.setlists) && parsed.setlists.length > 0 ? parsed.setlists : DEFAULT_SETLISTS,
      };
    }
  } catch {
    // fallback to defaults
  }
  return { presets: DEFAULT_PRESETS, setlists: DEFAULT_SETLISTS };
}

function saveStore(store: LibraryStore): void {
  try {
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist SyncBeat library:', err);
  }
}

let libraryStore = loadStore();

interface ServerSession {
  state: MetronomeSessionState;
  hostToken: string;
  participantTokens: Map<string, string>;
  sockets: Map<string, WebSocket>;
  automationTimer: NodeJS.Timeout | null;
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

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTime: Date.now(), activeSessions: sessions.size });
  });

  app.get('/api/library', (_req, res) => {
    res.json(libraryStore);
  });

  app.put('/api/library/presets', (req, res) => {
    const { presets } = req.body as { presets?: unknown };
    if (!Array.isArray(presets)) {
      res.status(400).json({ error: 'Invalid presets array' });
      return;
    }
    libraryStore.presets = presets.slice(0, 100) as MetronomePreset[];
    saveStore(libraryStore);
    res.json({ ok: true, presets: libraryStore.presets });
  });

  app.put('/api/library/setlists', (req, res) => {
    const { setlists } = req.body as { setlists?: unknown };
    if (!Array.isArray(setlists)) {
      res.status(400).json({ error: 'Invalid setlists array' });
      return;
    }
    libraryStore.setlists = setlists.slice(0, 50) as Setlist[];
    saveStore(libraryStore);
    res.json({ ok: true, setlists: libraryStore.setlists });
  });

  // Public session lookup for join prompt
  app.get('/api/sessions/:code', (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const session = sessions.get(code);
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
  app.post('/api/sessions', (req, res) => {
    const body = req.body as {
      name?: unknown;
      hostName?: unknown;
      hostRole?: unknown;
      bpm?: unknown;
      timeSignature?: TimeSignature;
      subdivision?: SubdivisionType;
      clickSound?: ClickSoundId;
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

    const initialSetlist =
      Array.isArray(body.setlist) && body.setlist.length > 0
        ? body.setlist.slice(0, 100)
        : DEFAULT_SETLISTS[0].items;

    const state: MetronomeSessionState = {
      sessionId,
      name: sanitizeText(body.name, 48, 'Band Rehearsal'),
      hostId,
      hostName,
      hostRole,
      isLocked: false,
      bpm: clampBpm(body.bpm ?? 120),
      timeSignature: ts,
      accentPattern: buildAccentPattern(ts),
      subdivision: body.subdivision ?? 'quarter',
      clickProfile: {
        ...DEFAULT_CLICK_PROFILE,
        normalSound: body.clickSound ?? DEFAULT_CLICK_PROFILE.normalSound,
      },
      countInBars: body.countInBars ?? 0,
      playback: {
        isPlaying: false,
        anchorServerMs: now,
        anchorTotalBeats: 0,
        sequenceId: 1,
        activeSectionIndex: 0,
      },
      activeSetlistId: body.activeSetlistId ?? DEFAULT_SETLISTS[0].id,
      activeSongIndex: typeof body.activeSongIndex === 'number' ? body.activeSongIndex : 0,
      setlist: initialSetlist,
      participants: [hostParticipant],
      createdAt: now,
      lastActivityAt: now,
    };

    const serverSession: ServerSession = {
      state,
      hostToken,
      participantTokens: new Map([[hostId, hostToken]]),
      sockets: new Map(),
      automationTimer: null,
    };

    sessions.set(sessionId, serverSession);
    res.status(201).json({
      session: state,
      participantId: hostId,
      token: hostToken,
      serverTime: Date.now(),
    });
  });

  // Join existing session (Participant)
  app.post('/api/sessions/:code/join', (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const session = sessions.get(code);
    if (!session) {
      res.status(404).json({ error: 'Session not found. Check the code and try again.' });
      return;
    }
    if (session.state.isLocked) {
      res.status(403).json({ error: 'This session is locked by the host.' });
      return;
    }

    const body = req.body as { name?: unknown; role?: unknown };
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

    res.status(201).json({
      session: session.state,
      participantId,
      token,
      serverTime: Date.now(),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (reqUrl.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    let currentSessionRef: ServerSession | null = null;
    let boundParticipantId: string | null = null;

    ws.on('message', (rawData) => {
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
        sendJson(ws, {
          type: 'clock:pong',
          clientSendTime: msg.clientSendTime,
          serverTime: Date.now(),
        });
        return;
      }

      if (type === 'auth') {
        const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId.toUpperCase().trim() : '';
        const participantId = typeof msg.participantId === 'string' ? msg.participantId : '';
        const token = typeof msg.token === 'string' ? msg.token : '';

        const session = sessions.get(sessionId);
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

        sendJson(ws, {
          type: 'session:state',
          session: session.state,
          serverTime: Date.now(),
        });
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
  }, 5 * 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: { server } },
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
