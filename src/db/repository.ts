import { eq, lt } from 'drizzle-orm';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETLISTS,
} from '../constants/metronomeData.ts';
import type {
  MetronomePreset,
  MetronomeSessionState,
  Setlist,
} from '../types/metronome.ts';
import { db, isDbConfigured } from './index.ts';
import {
  liveSessions,
  PersistedSessionConfigPayload,
  sharedLibrary,
  userLibraries,
  users,
  userSessionConfigs,
} from './schema.ts';

export interface LiveSessionDbRecord {
  sessionId: string;
  hostUid: string | null;
  hostToken: string;
  state: MetronomeSessionState;
  participantTokens: Record<string, string>;
  kickedIds: string[];
  ended: boolean;
}

const SHARED_LIBRARY_ID = 'default';

// In-memory fallback store used when Cloud SQL is not configured or unreachable
let memSharedLibrary: { presets: MetronomePreset[]; setlists: Setlist[] } = {
  presets: DEFAULT_PRESETS,
  setlists: DEFAULT_SETLISTS,
};
let memUserSeq = 1;
const memUsers = new Map<
  string,
  { id: number; uid: string; email: string; displayName: string | null; createdAt: Date; updatedAt: Date }
>();
const memUserLibraries = new Map<
  string,
  { presets: MetronomePreset[]; setlists: Setlist[]; updatedAt: number }
>();
const memUserSessionConfigs = new Map<string, PersistedSessionConfigPayload>();
const memLiveSessions = new Map<string, LiveSessionDbRecord & { lastActivityMs: number }>();

export async function getSharedLibrary(): Promise<{
  presets: MetronomePreset[];
  setlists: Setlist[];
}> {
  if (!isDbConfigured) {
    return memSharedLibrary;
  }
  try {
    const rows = await db
      .select()
      .from(sharedLibrary)
      .where(eq(sharedLibrary.id, SHARED_LIBRARY_ID))
      .limit(1);
    const row = rows[0];
    if (!row) {
      await upsertSharedLibrary(DEFAULT_PRESETS, DEFAULT_SETLISTS);
      return { presets: DEFAULT_PRESETS, setlists: DEFAULT_SETLISTS };
    }
    return {
      presets: Array.isArray(row.presets) && row.presets.length > 0 ? row.presets : DEFAULT_PRESETS,
      setlists:
        Array.isArray(row.setlists) && row.setlists.length > 0 ? row.setlists : DEFAULT_SETLISTS,
    };
  } catch (error) {
    console.warn('Database unavailable (getSharedLibrary), using in-memory fallback:', error);
    return memSharedLibrary;
  }
}

export async function upsertSharedLibrary(
  presets: MetronomePreset[],
  setlists: Setlist[]
): Promise<void> {
  memSharedLibrary = {
    presets: presets.slice(0, 100),
    setlists: setlists.slice(0, 50),
  };
  if (!isDbConfigured) return;
  try {
    await db
      .insert(sharedLibrary)
      .values({
        id: SHARED_LIBRARY_ID,
        presets: memSharedLibrary.presets,
        setlists: memSharedLibrary.setlists,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sharedLibrary.id,
        set: {
          presets: memSharedLibrary.presets,
          setlists: memSharedLibrary.setlists,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.warn('Database unavailable (upsertSharedLibrary), saved to memory:', error);
  }
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
  const existing = memUsers.get(uid);
  const now = new Date();
  const memUser = {
    id: existing?.id ?? memUserSeq++,
    uid,
    email,
    displayName: displayName ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  memUsers.set(uid, memUser);

  if (!isDbConfigured) {
    return memUser;
  }
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0] ?? memUser;
  } catch (error) {
    console.warn('Database unavailable (getOrCreateUser), using in-memory fallback:', error);
    return memUser;
  }
}

export async function getUserLibrary(uid: string): Promise<{
  presets: MetronomePreset[];
  setlists: Setlist[];
  updatedAt: number;
} | null> {
  if (!isDbConfigured) {
    return memUserLibraries.get(uid) ?? null;
  }
  try {
    const rows = await db
      .select()
      .from(userLibraries)
      .where(eq(userLibraries.userUid, uid))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      presets: Array.isArray(row.presets) && row.presets.length > 0 ? row.presets : DEFAULT_PRESETS,
      setlists:
        Array.isArray(row.setlists) && row.setlists.length > 0 ? row.setlists : DEFAULT_SETLISTS,
      updatedAt: row.updatedAt.getTime(),
    };
  } catch (error) {
    console.warn('Database unavailable (getUserLibrary), using in-memory fallback:', error);
    return memUserLibraries.get(uid) ?? null;
  }
}

export async function upsertUserLibrary(
  uid: string,
  presets: MetronomePreset[],
  setlists: Setlist[]
): Promise<void> {
  const slicedPresets = presets.slice(0, 100);
  const slicedSetlists = setlists.slice(0, 50);
  memUserLibraries.set(uid, {
    presets: slicedPresets,
    setlists: slicedSetlists,
    updatedAt: Date.now(),
  });
  if (!isDbConfigured) return;
  try {
    await db
      .insert(userLibraries)
      .values({
        userUid: uid,
        presets: slicedPresets,
        setlists: slicedSetlists,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userLibraries.userUid,
        set: {
          presets: slicedPresets,
          setlists: slicedSetlists,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.warn('Database unavailable (upsertUserLibrary), saved to memory:', error);
  }
}

export async function getUserSessionConfig(
  uid: string
): Promise<PersistedSessionConfigPayload | null> {
  if (!isDbConfigured) {
    return memUserSessionConfigs.get(uid) ?? null;
  }
  try {
    const rows = await db
      .select()
      .from(userSessionConfigs)
      .where(eq(userSessionConfigs.userUid, uid))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row.config,
      updatedAt: row.config.updatedAt ?? row.updatedAt.getTime(),
    };
  } catch (error) {
    console.warn('Database unavailable (getUserSessionConfig), using in-memory fallback:', error);
    return memUserSessionConfigs.get(uid) ?? null;
  }
}

export async function upsertUserSessionConfig(
  uid: string,
  config: PersistedSessionConfigPayload
): Promise<void> {
  const payload: PersistedSessionConfigPayload = {
    ...config,
    updatedAt: config.updatedAt ?? Date.now(),
  };
  memUserSessionConfigs.set(uid, payload);
  if (!isDbConfigured) return;
  try {
    await db
      .insert(userSessionConfigs)
      .values({
        userUid: uid,
        config: payload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSessionConfigs.userUid,
        set: {
          config: payload,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.warn('Database unavailable (upsertUserSessionConfig), saved to memory:', error);
  }
}

export async function getLiveSessionFromDb(
  sessionId: string
): Promise<LiveSessionDbRecord | null> {
  const clean = sessionId.toUpperCase().trim();
  if (!isDbConfigured) {
    return memLiveSessions.get(clean) ?? null;
  }
  try {
    const rows = await db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.sessionId, clean))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      hostUid: row.hostUid,
      hostToken: row.hostToken,
      state: row.state,
      participantTokens: row.participantTokens,
      kickedIds: row.kickedIds,
      ended: row.ended,
    };
  } catch (error) {
    console.warn('Database unavailable (getLiveSessionFromDb), using in-memory fallback:', error);
    return memLiveSessions.get(clean) ?? null;
  }
}

export async function upsertLiveSessionInDb(record: LiveSessionDbRecord): Promise<void> {
  const clean = record.sessionId.toUpperCase().trim();
  memLiveSessions.set(clean, { ...record, sessionId: clean, lastActivityMs: Date.now() });
  if (!isDbConfigured) return;
  try {
    await db
      .insert(liveSessions)
      .values({
        sessionId: clean,
        hostUid: record.hostUid,
        hostToken: record.hostToken,
        state: record.state,
        participantTokens: record.participantTokens,
        kickedIds: record.kickedIds,
        ended: record.ended,
        lastActivityAt: new Date(),
      })
      .onConflictDoUpdate({
        target: liveSessions.sessionId,
        set: {
          hostToken: record.hostToken,
          state: record.state,
          participantTokens: record.participantTokens,
          kickedIds: record.kickedIds,
          ended: record.ended,
          lastActivityAt: new Date(),
        },
      });
  } catch (error) {
    console.warn('Database unavailable (upsertLiveSessionInDb), saved to memory:', error);
  }
}

export async function deleteLiveSessionFromDb(sessionId: string): Promise<void> {
  const clean = sessionId.toUpperCase().trim();
  memLiveSessions.delete(clean);
  if (!isDbConfigured) return;
  try {
    await db
      .delete(liveSessions)
      .where(eq(liveSessions.sessionId, clean));
  } catch (error) {
    console.warn('Database unavailable (deleteLiveSessionFromDb):', error);
  }
}

export async function pruneExpiredLiveSessions(cutoff: Date): Promise<void> {
  const cutoffMs = cutoff.getTime();
  for (const [id, rec] of memLiveSessions.entries()) {
    if (rec.lastActivityMs < cutoffMs) {
      memLiveSessions.delete(id);
    }
  }
  if (!isDbConfigured) return;
  try {
    await db.delete(liveSessions).where(lt(liveSessions.lastActivityAt, cutoff));
  } catch (error) {
    console.warn('Database unavailable (pruneExpiredLiveSessions):', error);
  }
}
