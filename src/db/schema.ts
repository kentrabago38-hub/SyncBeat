import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  BeatAccentType,
  ClickProfile,
  CountInBars,
  MetronomePreset,
  MetronomeSessionState,
  MusicianRole,
  Setlist,
  SetlistItem,
  SubdivisionType,
  TimeSignature,
} from '../types/metronome';

export interface PersistedSessionConfigPayload {
  name?: string;
  hostName?: string;
  hostRole?: MusicianRole;
  bpm?: number;
  timeSignature?: TimeSignature;
  accentPattern?: BeatAccentType[];
  subdivision?: SubdivisionType;
  clickProfile?: Partial<ClickProfile>;
  countInBars?: CountInBars;
  activeSetlistId?: string | null;
  activeSongIndex?: number;
  setlist?: SetlistItem[];
  updatedAt?: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userLibraries = pgTable('user_libraries', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .unique()
    .references(() => users.uid, { onDelete: 'cascade' }),
  presets: jsonb('presets').$type<MetronomePreset[]>().notNull(),
  setlists: jsonb('setlists').$type<Setlist[]>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userSessionConfigs = pgTable('user_session_configs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .unique()
    .references(() => users.uid, { onDelete: 'cascade' }),
  config: jsonb('config').$type<PersistedSessionConfigPayload>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const liveSessions = pgTable('live_sessions', {
  sessionId: text('session_id').primaryKey(),
  hostUid: text('host_uid'),
  hostToken: text('host_token').notNull(),
  state: jsonb('state').$type<MetronomeSessionState>().notNull(),
  participantTokens: jsonb('participant_tokens').$type<Record<string, string>>().notNull(),
  kickedIds: jsonb('kicked_ids').$type<string[]>().notNull(),
  ended: boolean('ended').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
});
