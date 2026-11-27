import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import type {
  BeatAccentType,
  ClickProfile,
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
} from '../src/types/metronome';

const DEFAULT_CLICK_PROFILE: ClickProfile = {
  clickEnabled: true,
  accentSound: 'studio',
  normalSound: 'woodblock',
  subdivisionSound: 'soft',
  accentVolume: 0.95,
  normalVolume: 0.75,
  subdivisionVolume: 0.42,
  masterVolume: 0.85,
  vocalMode: 'beats',
  vocalVolume: 0.9,
  vocalStyle: 'auto',
};

function buildAccentPattern(ts: TimeSignature): BeatAccentType[] {
  const pattern: BeatAccentType[] = new Array(ts.numerator).fill('normal');
  if (ts.grouping && ts.grouping.length > 0) {
    let idx = 0;
    for (const groupSize of ts.grouping) {
      if (idx < pattern.length) {
        pattern[idx] = 'accent';
      }
      idx += groupSize;
    }
  } else if (pattern.length > 0) {
    pattern[0] = 'accent';
  }
  return pattern;
}

const DEFAULT_PRESETS: MetronomePreset[] = [
  {
    id: 'preset-church',
    name: 'Church Rehearsal',
    bpm: 128,
    timeSignature: { numerator: 4, denominator: 4 },
    clickSound: 'woodblock',
    subdivision: 'eighth',
    accentPattern: ['accent', 'normal', 'normal', 'normal'],
    countInBars: 2,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-practice',
    name: 'Daily Practice',
    bpm: 90,
    timeSignature: { numerator: 4, denominator: 4 },
    clickSound: 'digital',
    subdivision: 'quarter',
    accentPattern: ['accent', 'normal', 'normal', 'normal'],
    countInBars: 1,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-jazz',
    name: 'Jazz Swing',
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    clickSound: 'soft',
    subdivision: 'triplet',
    accentPattern: ['normal', 'accent', 'normal', 'accent'],
    countInBars: 1,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-worship-68',
    name: '6/8 Worship',
    bpm: 72,
    timeSignature: { numerator: 6, denominator: 8, grouping: [3, 3] },
    clickSound: 'warm',
    subdivision: 'quarter',
    accentPattern: ['accent', 'normal', 'normal', 'accent', 'normal', 'normal'],
    countInBars: 2,
    updatedAt: 1700000000000,
  },
];

const DEFAULT_SETLISTS: Setlist[] = [
  {
    id: 'set-sunday-worship',
    name: 'Sunday Worship Set',
    updatedAt: 1700000000000,
    items: [
      {
        id: 'song-1',
        songName: 'Holy Forever',
        bpm: 128,
        timeSignature: { numerator: 4, denominator: 4 },
        clickSound: 'studio',
        subdivision: 'eighth',
        accentPattern: ['accent', 'normal', 'normal', 'normal'],
        countInBars: 2,
        bars: 0,
        autoAdvance: false,
        notes: 'Pad swell in bar 1, full band on chorus',
        tempoSections: [
          { id: 'sec-1', label: 'Intro & Verse', bpm: 128, bars: 8 },
          { id: 'sec-2', label: 'Chorus Lift', bpm: 130, bars: 8 },
        ],
      },
      {
        id: 'song-2',
        songName: 'Way Maker',
        bpm: 68,
        timeSignature: { numerator: 4, denominator: 4 },
        clickSound: 'warm',
        subdivision: 'eighth',
        accentPattern: ['accent', 'normal', 'normal', 'normal'],
        countInBars: 2,
        bars: 0,
        autoAdvance: false,
        notes: 'Keys & acoustic intro',
      },
      {
        id: 'song-3',
        songName: 'Amazing Grace (6/8)',
        bpm: 72,
        timeSignature: { numerator: 6, denominator: 8, grouping: [3, 3] },
        clickSound: 'woodblock',
        subdivision: 'quarter',
        accentPattern: ['accent', 'normal', 'normal', 'accent', 'normal', 'normal'],
        countInBars: 2,
        bars: 0,
        autoAdvance: false,
        notes: 'Feel dotted quarter groove',
      },
      {
        id: 'song-4',
        songName: 'Goodness of God',
        bpm: 63,
        timeSignature: { numerator: 4, denominator: 4 },
        clickSound: 'tight',
        subdivision: 'sixteenth',
        accentPattern: ['accent', 'normal', 'normal', 'normal'],
        countInBars: 2,
        bars: 0,
        autoAdvance: false,
        notes: 'Subdivision keeps bridge pocket steady',
      },
      {
        id: 'song-5',
        songName: 'Praise (Upbeat)',
        bpm: 145,
        timeSignature: { numerator: 4, denominator: 4 },
        clickSound: 'stage',
        subdivision: 'quarter',
        accentPattern: ['accent', 'normal', 'normal', 'normal'],
        countInBars: 4,
        bars: 0,
        autoAdvance: false,
        notes: '4-bar drum count-in',
      },
    ],
  },
];

interface StoredSessionRecord {
  state: MetronomeSessionState;
  hostToken: string;
  participantTokens: Record<string, string>;
  kickedIds: string[];
  pendingSignals?: Record<string, StageSignalMessage[]>;
  ended?: boolean;
}

interface LibraryStore {
  presets: MetronomePreset[];
  setlists: Setlist[];
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_SECONDS = 4 * 60 * 60;

// In-memory store (always kept in sync as fallback when Redis is unconfigured or unavailable)
const memorySessions = new Map<string, StoredSessionRecord>();
let memoryLibrary: LibraryStore = {
  presets: DEFAULT_PRESETS,
  setlists: DEFAULT_SETLISTS,
};

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token && /^https?:\/\//i.test(url.trim())) {
    return { url: url.trim().replace(/\/+$/, ''), token: token.trim() };
  }
  return null;
}

async function redisCommand<T = unknown>(args: Array<string | number>): Promise<T | null> {
  const cfg = getRedisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Redis REST error: ${res.status}`);
    }
    const data = (await res.json()) as { result?: T; error?: string };
    if (data.error) {
      throw new Error(data.error);
    }
    return (data.result ?? null) as T | null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSessionRecord(code: string): Promise<StoredSessionRecord | null> {
  const clean = code.toUpperCase().trim();
  const cfg = getRedisConfig();
  if (cfg) {
    try {
      const raw = await redisCommand<string>(['GET', `syncbeat:session:${clean}`]);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSessionRecord;
        memorySessions.set(clean, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('Redis getSessionRecord fallback to memory:', err);
    }
  }
  return memorySessions.get(clean) ?? null;
}

function tryBuildRehydratedRecord(
  code: string,
  participantId: string | undefined,
  token: string | undefined,
  rehydrateState: unknown
): StoredSessionRecord | null {
  if (getRedisConfig() || !participantId || !token || !rehydrateState || typeof rehydrateState !== 'object') {
    return null;
  }
  const candidate = rehydrateState as MetronomeSessionState;
  if (
    typeof candidate.sessionId !== 'string' ||
    candidate.sessionId.toUpperCase().trim() !== code ||
    !Array.isArray(candidate.participants)
  ) {
    return null;
  }
  const hasParticipant = candidate.participants.some((p) => p && p.id === participantId);
  if (!hasParticipant) {
    return null;
  }
  return {
    state: { ...candidate, sessionId: code },
    hostToken: candidate.hostId === participantId ? token : '',
    participantTokens: { [participantId]: token },
    kickedIds: [],
    ended: false,
  };
}

async function saveSessionRecord(code: string, record: StoredSessionRecord): Promise<void> {
  const clean = code.toUpperCase().trim();
  record.state.lastActivityAt = Date.now();
  memorySessions.set(clean, record);
  const cfg = getRedisConfig();
  if (cfg) {
    try {
      await redisCommand([
        'SET',
        `syncbeat:session:${clean}`,
        JSON.stringify(record),
        'EX',
        SESSION_TTL_SECONDS,
      ]);
    } catch (err) {
      console.warn('Redis saveSessionRecord fallback to memory:', err);
    }
  }
}

async function deleteSessionRecord(code: string): Promise<void> {
  const clean = code.toUpperCase().trim();
  memorySessions.delete(clean);
  const cfg = getRedisConfig();
  if (cfg) {
    try {
      await redisCommand(['DEL', `syncbeat:session:${clean}`]);
    } catch (err) {
      console.warn('Redis deleteSessionRecord error:', err);
    }
  }
}

async function getLibraryStore(): Promise<LibraryStore> {
  const cfg = getRedisConfig();
  if (cfg) {
    try {
      const raw = await redisCommand<string>(['GET', 'syncbeat:library']);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LibraryStore>;
        const store = {
          presets:
            Array.isArray(parsed.presets) && parsed.presets.length > 0
              ? parsed.presets
              : DEFAULT_PRESETS,
          setlists:
            Array.isArray(parsed.setlists) && parsed.setlists.length > 0
              ? parsed.setlists
              : DEFAULT_SETLISTS,
        };
        memoryLibrary = store;
        return store;
      }
    } catch (err) {
      console.warn('Redis getLibraryStore fallback to memory:', err);
    }
  }
  return memoryLibrary;
}

async function saveLibraryStore(store: LibraryStore): Promise<void> {
  memoryLibrary = store;
  const cfg = getRedisConfig();
  if (cfg) {
    try {
      await redisCommand(['SET', 'syncbeat:library', JSON.stringify(store)]);
    } catch (err) {
      console.warn('Redis saveLibraryStore fallback to memory:', err);
    }
  }
}

async function generateSessionCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    const existing = await getSessionRecord(code);
    if (!existing) return code;
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

function applySongSelectionToState(
  state: MetronomeSessionState,
  songIndex: number,
  keepPlaying: boolean,
  anchorMs?: number
): void {
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
    state.playback.anchorServerMs = anchorMs ?? Date.now() + 110;
  } else {
    state.playback.isPlaying = false;
    state.playback.anchorServerMs = Date.now();
  }
}

// Stateless-safe lazy evaluation of tempoSections & autoAdvance for serverless environments
function advanceAutomationIfDue(state: MetronomeSessionState, now: number): boolean {
  let changed = false;
  for (let guard = 0; guard < 12; guard++) {
    if (!state.playback.isPlaying || state.setlist.length === 0) break;
    const song = state.setlist[state.activeSongIndex];
    if (!song) break;

    const beatsPerBar = Math.max(1, state.timeSignature.numerator);
    const countInBeats = state.countInBars * beatsPerBar;
    const currentTotalBeats = getCurrentTotalBeats(state, now);
    const songBeatsElapsed = currentTotalBeats - countInBeats;

    if (song.tempoSections && song.tempoSections.length > 0) {
      const idx = state.playback.activeSectionIndex;
      const activeSection = song.tempoSections[idx];
      if (activeSection && activeSection.bars > 0) {
        let targetCumulative = 0;
        for (let i = 0; i <= idx; i++) {
          targetCumulative += (song.tempoSections[i]?.bars ?? 0) * beatsPerBar;
        }
        if (songBeatsElapsed >= targetCumulative) {
          const overshootBeats = songBeatsElapsed - targetCumulative;
          const transitionMs = now - (overshootBeats / state.bpm) * 60000;
          const nextIdx = idx + 1;
          if (nextIdx < song.tempoSections.length) {
            state.playback.anchorServerMs = transitionMs;
            state.playback.anchorTotalBeats = countInBeats + targetCumulative;
            state.playback.activeSectionIndex = nextIdx;
            state.playback.sequenceId += 1;
            state.bpm = clampBpm(song.tempoSections[nextIdx].bpm);
            changed = true;
            continue;
          }
          if (song.autoAdvance && state.activeSongIndex + 1 < state.setlist.length) {
            applySongSelectionToState(state, state.activeSongIndex + 1, true, transitionMs);
            changed = true;
            continue;
          }
        }
      }
      break;
    }

    if (song.autoAdvance && song.bars > 0 && state.activeSongIndex + 1 < state.setlist.length) {
      const targetSongBeats = song.bars * beatsPerBar;
      if (songBeatsElapsed >= targetSongBeats) {
        const overshootBeats = songBeatsElapsed - targetSongBeats;
        const transitionMs = now - (overshootBeats / state.bpm) * 60000;
        applySongSelectionToState(state, state.activeSongIndex + 1, true, transitionMs);
        changed = true;
        continue;
      }
    }
    break;
  }
  return changed;
}

function canControl(
  state: MetronomeSessionState,
  participantId: string,
  action: 'playStop' | 'bpm' | 'setlistNav' | 'hostOnly'
): boolean {
  if (participantId === state.hostId) return true;
  if (action === 'hostOnly') return false;
  const p = state.participants.find((m) => m.id === participantId);
  if (!p) return false;
  return Boolean(p.permissions[action]);
}

function normalizeObjectBody(body: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(body)) {
    try {
      const parsed = JSON.parse(body.toString('utf8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (body && typeof body === 'object') {
    return body as Record<string, unknown>;
  }
  return {};
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  const now = Date.now();
  res.json({
    ok: true,
    runtime: 'vercel-serverless',
    storageMode: getRedisConfig() ? 'redis' : 'memory',
    serverRecvTime: now,
    serverTime: now,
  });
});

app.get('/api/network-info', (_req, res) => {
  res.json({
    runtime: 'vercel-serverless',
    port: null,
    addresses: [],
  });
});

app.get('/api/user/sync', (_req, res) => {
  res.json({ ok: true, library: null, sessionConfig: null });
});

app.put('/api/user/library', (_req, res) => {
  res.json({ ok: true });
});

app.put('/api/user/session-config', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/library', async (_req, res) => {
  try {
    const store = await getLibraryStore();
    res.json(store);
  } catch {
    res.json({ presets: DEFAULT_PRESETS, setlists: DEFAULT_SETLISTS });
  }
});

app.put('/api/library/presets', async (req, res) => {
  try {
    const body = normalizeObjectBody(req.body);
    const presets = body.presets;
    if (!Array.isArray(presets)) {
      res.status(400).json({ error: 'Invalid presets array' });
      return;
    }
    const store = await getLibraryStore();
    store.presets = presets.slice(0, 100) as MetronomePreset[];
    await saveLibraryStore(store);
    res.json({ ok: true, presets: store.presets });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save presets',
    });
  }
});

app.put('/api/library/setlists', async (req, res) => {
  try {
    const body = normalizeObjectBody(req.body);
    const setlists = body.setlists;
    if (!Array.isArray(setlists)) {
      res.status(400).json({ error: 'Invalid setlists array' });
      return;
    }
    const store = await getLibraryStore();
    store.setlists = setlists.slice(0, 50) as Setlist[];
    await saveLibraryStore(store);
    res.json({ ok: true, setlists: store.setlists });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save setlists',
    });
  }
});

app.get('/api/sessions/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    const record = await getSessionRecord(code);
    if (!record || record.ended) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.json({
      sessionId: record.state.sessionId,
      name: record.state.name,
      hostName: record.state.hostName,
      hostRole: record.state.hostRole,
      bpm: record.state.bpm,
      timeSignature: record.state.timeSignature,
      participantCount: record.state.participants.length,
      isLocked: record.state.isLocked,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to look up session',
    });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const body = normalizeObjectBody(req.body) as {
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

    const sessionId = await generateSessionCode();
    const hostId = crypto.randomUUID();
    const hostToken = crypto.randomBytes(24).toString('hex');
    const hostName = sanitizeText(body.hostName, 32, 'Host');
    const hostRole = sanitizeRole(body.hostRole);
    const ts: TimeSignature =
      body.timeSignature && typeof body.timeSignature.numerator === 'number'
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

    const record: StoredSessionRecord = {
      state,
      hostToken,
      participantTokens: { [hostId]: hostToken },
      kickedIds: [],
    };

    await saveSessionRecord(sessionId, record);

    res.status(201).json({
      session: state,
      participantId: hostId,
      token: hostToken,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to create session. Please try again.',
    });
  }
});

app.post('/api/sessions/:code/join', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    const record = await getSessionRecord(code);
    if (!record || record.ended) {
      res.status(404).json({ error: 'Session not found. Check the code and try again.' });
      return;
    }
    if (record.state.isLocked) {
      res.status(403).json({ error: 'This session is locked by the host.' });
      return;
    }

    const body = normalizeObjectBody(req.body) as { name?: unknown; role?: unknown };
    const participantId = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    const role = sanitizeRole(body.role);
    const defaultName = `Musician ${record.state.participants.length}`;
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

    record.participantTokens[participantId] = token;
    record.state.participants.push(participant);
    await saveSessionRecord(code, record);

    res.status(201).json({
      session: record.state,
      participantId,
      token,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to join session. Please try again.',
    });
  }
});

// Serverless HTTP state/clock synchronization endpoint (fallback when WebSockets aren't available on Vercel)
app.post('/api/sessions/:code/sync', async (req, res) => {
  try {
    const serverRecvTime = Date.now();
    const code = String(req.params.code || '').toUpperCase().trim();
    const body = normalizeObjectBody(req.body) as {
      participantId?: string;
      token?: string;
      latencyMs?: number;
      status?: Participant['status'];
      rehydrateState?: unknown;
    };
    const { participantId, token, latencyMs, status, rehydrateState } = body;

    let record = await getSessionRecord(code);
    if (!record && rehydrateState) {
      record = tryBuildRehydratedRecord(code, participantId, token, rehydrateState);
      if (record) {
        await saveSessionRecord(code, record);
      }
    }
    if (!record) {
      res.status(404).json({
        error: 'Session not found',
        ended: false,
        rehydrateRequired: !getRedisConfig(),
      });
      return;
    }
    if (record.ended) {
      res.status(410).json({ error: 'Session ended by host', ended: true });
      return;
    }
    if (participantId && record.kickedIds.includes(participantId)) {
      res.status(403).json({ error: 'Removed by session host', kicked: true });
      return;
    }
    if (!participantId || !token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }
    if (record.participantTokens[participantId] !== token) {
      const isListedParticipant =
        !getRedisConfig() &&
        !record.participantTokens[participantId] &&
        record.state.participants.some((m) => m.id === participantId);
      if (isListedParticipant) {
        record.participantTokens[participantId] = token;
        await saveSessionRecord(code, record);
      } else {
        res.status(401).json({ error: 'Unauthorized session token' });
        return;
      }
    }

    const now = Date.now();
    let dirty = advanceAutomationIfDue(record.state, now);

    const p = record.state.participants.find((m) => m.id === participantId);
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

    const queuedSignals = (record.pendingSignals?.[participantId] ?? []).filter(
      (sig) => now - sig.createdAt < 45_000
    );
    if (record.pendingSignals && record.pendingSignals[participantId]) {
      delete record.pendingSignals[participantId];
      dirty = true;
    }

    if (dirty) {
      await saveSessionRecord(code, record);
    }

    res.json({
      session: record.state,
      signals: queuedSignals,
      serverRecvTime,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('Error syncing session:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Session sync error',
    });
  }
});

app.post('/api/sessions/:code/signal', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    const body = normalizeObjectBody(req.body);
    const participantId = typeof body.participantId === 'string' ? body.participantId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const toParticipantId = typeof body.toParticipantId === 'string' ? body.toParticipantId : '';
    const kind = body.kind;

    let record = await getSessionRecord(code);
    if (!record && body.rehydrateState) {
      record = tryBuildRehydratedRecord(code, participantId, token, body.rehydrateState);
      if (record) {
        await saveSessionRecord(code, record);
      }
    }
    if (!record) {
      res.status(404).json({
        error: 'Session not found',
        ended: false,
        rehydrateRequired: !getRedisConfig(),
      });
      return;
    }
    if (record.ended) {
      res.status(410).json({ error: 'Session ended by host', ended: true });
      return;
    }
    if (!participantId || !token || record.participantTokens[participantId] !== token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }
    if (
      !toParticipantId ||
      (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') ||
      !record.state.participants.some((p) => p.id === toParticipantId)
    ) {
      res.status(400).json({ error: 'Invalid target peer or signal type' });
      return;
    }

    if (!record.pendingSignals) record.pendingSignals = {};
    const list = (record.pendingSignals[toParticipantId] ?? []).filter(
      (sig) => Date.now() - sig.createdAt < 45_000
    );
    list.push({
      id: crypto.randomUUID(),
      fromParticipantId: participantId,
      toParticipantId,
      kind,
      payload: body.payload,
      createdAt: Date.now(),
    });
    if (list.length > 30) list.shift();
    record.pendingSignals[toParticipantId] = list;
    await saveSessionRecord(code, record);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error relaying WebRTC signal:', error);
    res.status(500).json({ error: 'Signal relay error' });
  }
});

// Serverless command endpoint mirroring WebSocket host/participant commands
app.post('/api/sessions/:code/command', async (req, res) => {
  try {
    const serverRecvTime = Date.now();
    const code = String(req.params.code || '').toUpperCase().trim();
    const body = normalizeObjectBody(req.body);
    const participantId = typeof body.participantId === 'string' ? body.participantId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const type = typeof body.type === 'string' ? body.type : '';

    let record = await getSessionRecord(code);
    if (!record && body.rehydrateState) {
      record = tryBuildRehydratedRecord(code, participantId, token, body.rehydrateState);
      if (record) {
        await saveSessionRecord(code, record);
      }
    }
    if (!record) {
      res.status(404).json({
        error: 'Session not found',
        ended: false,
        rehydrateRequired: !getRedisConfig(),
      });
      return;
    }
    if (record.ended) {
      res.status(410).json({ error: 'Session ended by host', ended: true });
      return;
    }
    if (!participantId || !token) {
      res.status(401).json({ error: 'Unauthorized session token' });
      return;
    }
    if (record.participantTokens[participantId] !== token) {
      const isListedParticipant =
        !getRedisConfig() &&
        !record.participantTokens[participantId] &&
        record.state.participants.some((m) => m.id === participantId);
      if (isListedParticipant) {
        record.participantTokens[participantId] = token;
        await saveSessionRecord(code, record);
      } else {
        res.status(401).json({ error: 'Unauthorized session token' });
        return;
      }
    }

    const state = record.state;
    const now = Date.now();
    advanceAutomationIfDue(state, now);

    switch (type) {
      case 'transport:play': {
        if (!canControl(state, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = true;
        state.playback.anchorServerMs = now + 110;
        state.playback.sequenceId += 1;
        break;
      }

      case 'transport:pause': {
        if (!canControl(state, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const currentBeats = getCurrentTotalBeats(state, now);
        state.playback.isPlaying = false;
        state.playback.anchorTotalBeats = currentBeats;
        state.playback.anchorServerMs = now;
        state.playback.sequenceId += 1;
        break;
      }

      case 'transport:stop': {
        if (!canControl(state, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = false;
        state.playback.anchorTotalBeats = 0;
        state.playback.anchorServerMs = now;
        state.playback.activeSectionIndex = 0;
        state.playback.sequenceId += 1;
        break;
      }

      case 'transport:restart': {
        if (!canControl(state, participantId, 'playStop')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        state.playback.isPlaying = true;
        state.playback.anchorTotalBeats = 0;
        state.playback.anchorServerMs = now + 110;
        state.playback.activeSectionIndex = 0;
        state.playback.sequenceId += 1;
        break;
      }

      case 'metronome:update': {
        const patch = (body.patch ?? {}) as Record<string, unknown>;
        const changingBpmOnly = Object.keys(patch).every((k) => k === 'bpm');
        const allowed = changingBpmOnly
          ? canControl(state, participantId, 'bpm')
          : canControl(state, participantId, 'hostOnly');
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
        }

        if (patch.name !== undefined) {
          state.name = sanitizeText(patch.name, 48, state.name);
        }

        if (patch.isLocked !== undefined && canControl(state, participantId, 'hostOnly')) {
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
        if (!canControl(state, participantId, 'setlistNav')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const idx = Number(body.index);
        if (Number.isFinite(idx)) {
          applySongSelectionToState(state, idx, state.playback.isPlaying);
        }
        break;
      }

      case 'setlist:load': {
        if (!canControl(state, participantId, 'hostOnly')) {
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
        if (!canControl(state, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const oldId = state.sessionId;
        const newId = await generateSessionCode();
        state.sessionId = newId;
        await deleteSessionRecord(oldId);
        await saveSessionRecord(newId, record);
        res.json({ session: state, newSessionId: newId, serverRecvTime, serverTime: Date.now() });
        return;
      }

      case 'host:participantControl': {
        if (!canControl(state, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const targetId = typeof body.targetId === 'string' ? body.targetId : '';
        const action = body.action;
        if (targetId && targetId !== state.hostId) {
          if (action === 'remove') {
            state.participants = state.participants.filter((p) => p.id !== targetId);
            delete record.participantTokens[targetId];
            record.kickedIds.push(targetId);
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
        if (!canControl(state, participantId, 'hostOnly')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        record.ended = true;
        await saveSessionRecord(code, record);
        res.json({ ended: true, serverRecvTime, serverTime: Date.now() });
        return;
      }

      default:
        res.status(400).json({ error: 'Unknown command' });
        return;
    }

    await saveSessionRecord(code, record);
    res.json({ session: state, serverRecvTime, serverTime: Date.now() });
  } catch (error) {
    console.error('Error executing session command:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process command',
    });
  }
});

// Express JSON error middleware so uncaught errors never return opaque HTML 500s
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
});

export default app;
