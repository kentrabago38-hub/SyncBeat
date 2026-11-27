import { eq, lt } from 'drizzle-orm';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETLISTS,
} from '../constants/metronomeData';
import type {
  MetronomePreset,
  MetronomeSessionState,
  Setlist,
} from '../types/metronome';
import { db } from './index.ts';
import {
  liveSessions,
  PersistedSessionConfigPayload,
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

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
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
    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserLibrary(uid: string): Promise<{
  presets: MetronomePreset[];
  setlists: Setlist[];
  updatedAt: number;
} | null> {
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
    console.error('Database query failed (getUserLibrary):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertUserLibrary(
  uid: string,
  presets: MetronomePreset[],
  setlists: Setlist[]
): Promise<void> {
  try {
    await db
      .insert(userLibraries)
      .values({
        userUid: uid,
        presets: presets.slice(0, 100),
        setlists: setlists.slice(0, 50),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userLibraries.userUid,
        set: {
          presets: presets.slice(0, 100),
          setlists: setlists.slice(0, 50),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertUserLibrary):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserSessionConfig(
  uid: string
): Promise<PersistedSessionConfigPayload | null> {
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
    console.error('Database query failed (getUserSessionConfig):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertUserSessionConfig(
  uid: string,
  config: PersistedSessionConfigPayload
): Promise<void> {
  try {
    const payload: PersistedSessionConfigPayload = {
      ...config,
      updatedAt: config.updatedAt ?? Date.now(),
    };
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
    console.error('Database query failed (upsertUserSessionConfig):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getLiveSessionFromDb(
  sessionId: string
): Promise<LiveSessionDbRecord | null> {
  try {
    const rows = await db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.sessionId, sessionId.toUpperCase().trim()))
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
    console.error('Database query failed (getLiveSessionFromDb):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertLiveSessionInDb(record: LiveSessionDbRecord): Promise<void> {
  try {
    await db
      .insert(liveSessions)
      .values({
        sessionId: record.sessionId,
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
    console.error('Database query failed (upsertLiveSessionInDb):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteLiveSessionFromDb(sessionId: string): Promise<void> {
  try {
    await db
      .delete(liveSessions)
      .where(eq(liveSessions.sessionId, sessionId.toUpperCase().trim()));
  } catch (error) {
    console.error('Database query failed (deleteLiveSessionFromDb):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function pruneExpiredLiveSessions(cutoff: Date): Promise<void> {
  try {
    await db.delete(liveSessions).where(lt(liveSessions.lastActivityAt, cutoff));
  } catch (error) {
    console.error('Database query failed (pruneExpiredLiveSessions):', error);
  }
}
