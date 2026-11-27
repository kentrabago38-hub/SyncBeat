export type ClickSoundId =
  | 'digital'
  | 'sharp'
  | 'soft'
  | 'woodblock'
  | 'clave'
  | 'rim'
  | 'stick'
  | 'cowbell'
  | 'studio'
  | 'pulse'
  | 'synth'
  | 'etick'
  | 'warm'
  | 'tight'
  | 'stage';

export type ClickCategory = 'Classic' | 'Acoustic' | 'Electronic' | 'Worship / Band';

export interface ClickSoundMeta {
  id: ClickSoundId;
  name: string;
  category: ClickCategory;
  description: string;
}

export type BeatAccentType = 'accent' | 'normal' | 'mute';

export type SubdivisionType =
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'triplet'
  | 'eighth_triplet'
  | 'sixteenth_triplet';

export type CountInBars = 0 | 1 | 2 | 4 | 8;

export interface TimeSignature {
  numerator: number;
  denominator: 2 | 4 | 8 | 16;
  grouping?: number[];
}

export type VocalCountMode = 'off' | 'bar_countdown' | 'beats' | 'countin_only' | 'beats_and_sub';

export type VocalVoiceStyle = 'auto' | 'natural' | 'studio';

export interface ClickProfile {
  clickEnabled: boolean;
  accentSound: ClickSoundId;
  normalSound: ClickSoundId;
  subdivisionSound: ClickSoundId;
  accentVolume: number; // 0 to 1
  normalVolume: number; // 0 to 1
  subdivisionVolume: number; // 0 to 1
  masterVolume: number; // 0 to 1
  vocalMode: VocalCountMode;
  vocalVolume: number; // 0 to 1
  vocalStyle: VocalVoiceStyle;
}

export interface TempoSection {
  id: string;
  label: string;
  bpm: number;
  bars: number;
}

export interface SetlistItem {
  id: string;
  songName: string;
  bpm: number;
  timeSignature: TimeSignature;
  clickSound: ClickSoundId;
  subdivision: SubdivisionType;
  accentPattern: BeatAccentType[];
  countInBars: CountInBars;
  bars: number; // 0 = continuous / manual advance
  autoAdvance: boolean;
  notes?: string;
  tempoSections?: TempoSection[];
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
  updatedAt: number;
}

export interface MetronomePreset {
  id: string;
  name: string;
  bpm: number;
  timeSignature: TimeSignature;
  clickSound: ClickSoundId;
  subdivision: SubdivisionType;
  accentPattern: BeatAccentType[];
  countInBars: CountInBars;
  updatedAt: number;
}

export type MusicianRole =
  | 'Keyboard'
  | 'Guitar'
  | 'Bass'
  | 'Drums'
  | 'Vocals'
  | 'Piano'
  | 'Other';

export interface RemotePermissions {
  playStop: boolean;
  bpm: boolean;
  setlistNav: boolean;
}

export interface Participant {
  id: string;
  name: string;
  role: MusicianRole;
  isHost: boolean;
  isMuted: boolean;
  status: 'synced' | 'syncing' | 'unstable' | 'offline';
  latencyMs: number;
  permissions: RemotePermissions;
  joinedAt: number;
}

export interface PlaybackTimeline {
  isPlaying: boolean;
  anchorServerMs: number;
  anchorTotalBeats: number;
  sequenceId: number;
  activeSectionIndex: number;
}

export interface MetronomeSessionState {
  sessionId: string;
  name: string;
  hostId: string;
  hostName: string;
  hostRole: MusicianRole;
  isLocked: boolean;
  bpm: number;
  timeSignature: TimeSignature;
  accentPattern: BeatAccentType[];
  subdivision: SubdivisionType;
  clickProfile: ClickProfile;
  countInBars: CountInBars;
  playback: PlaybackTimeline;
  activeSetlistId: string | null;
  activeSongIndex: number;
  setlist: SetlistItem[];
  participants: Participant[];
  createdAt: number;
  lastActivityAt: number;
}

export type ConnectionQuality = 'synced' | 'syncing' | 'unstable' | 'offline';

export interface AccessibilitySettings {
  theme?: 'dark' | 'light';
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  hapticBeat: boolean;
  hapticAccentOnly: boolean;
  visualFlash: boolean;
}
