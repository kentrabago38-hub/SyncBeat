import {
  BeatAccentType,
  ClickProfile,
  ClickSoundMeta,
  MetronomePreset,
  MusicianRole,
  Setlist,
  SubdivisionType,
  TimeSignature,
} from '../types/metronome';

export const CLICK_SOUNDS: ClickSoundMeta[] = [
  // Classic
  { id: 'digital', name: 'Digital Click', category: 'Classic', description: 'Crisp quartz reference pulse' },
  { id: 'sharp', name: 'Sharp Click', category: 'Classic', description: 'High-cut transient for loud stages' },
  { id: 'soft', name: 'Soft Click', category: 'Classic', description: 'Gentle rounded transient for acoustic rooms' },
  // Acoustic
  { id: 'woodblock', name: 'Wood Block', category: 'Acoustic', description: 'Warm pitched studio woodblock' },
  { id: 'clave', name: 'Clave', category: 'Acoustic', description: 'Focused hardwood Latin percussion knock' },
  { id: 'rim', name: 'Rim', category: 'Acoustic', description: 'Snappy snare cross-stick rim click' },
  { id: 'stick', name: 'Stick', category: 'Acoustic', description: 'Natural hickory drumstick count click' },
  { id: 'cowbell', name: 'Cowbell', category: 'Acoustic', description: 'Muted metallic percussion bell' },
  // Electronic
  { id: 'studio', name: 'Studio', category: 'Electronic', description: 'Balanced DAW-style reference click' },
  { id: 'pulse', name: 'Pulse', category: 'Electronic', description: 'Punchy square-envelope modular tick' },
  { id: 'synth', name: 'Synth', category: 'Electronic', description: 'Clean harmonic FM sine ping' },
  { id: 'etick', name: 'Electronic Tick', category: 'Electronic', description: 'Ultra-short micro-transient sample' },
  // Worship / Band
  { id: 'warm', name: 'Warm Click', category: 'Worship / Band', description: 'Low-fatigue in-ear monitor click' },
  { id: 'tight', name: 'Tight Click', category: 'Worship / Band', description: 'Locked-in rhythmic transient for drums' },
  { id: 'stage', name: 'Stage Click', category: 'Worship / Band', description: 'Cuts cleanly through live band mixes' },
];

export const TIME_SIGNATURE_PRESETS: Array<{
  label: string;
  ts: TimeSignature;
  groupings?: number[][];
}> = [
  { label: '2/4', ts: { numerator: 2, denominator: 4 } },
  { label: '3/4', ts: { numerator: 3, denominator: 4 } },
  { label: '4/4', ts: { numerator: 4, denominator: 4 } },
  { label: '5/4', ts: { numerator: 5, denominator: 4, grouping: [3, 2] }, groupings: [[3, 2], [2, 3]] },
  { label: '6/8', ts: { numerator: 6, denominator: 8, grouping: [3, 3] }, groupings: [[3, 3], [2, 2, 2]] },
  { label: '7/8', ts: { numerator: 7, denominator: 8, grouping: [2, 2, 3] }, groupings: [[2, 2, 3], [3, 2, 2], [2, 3, 2]] },
  { label: '9/8', ts: { numerator: 9, denominator: 8, grouping: [3, 3, 3] }, groupings: [[3, 3, 3], [2, 2, 2, 3]] },
  { label: '12/8', ts: { numerator: 12, denominator: 8, grouping: [3, 3, 3, 3] } },
];

export const SUBDIVISIONS: Array<{
  id: SubdivisionType;
  label: string;
  shortLabel: string;
  perBeat: number;
  syllables: string[];
}> = [
  { id: 'quarter', label: 'Quarter Notes', shortLabel: '1/4', perBeat: 1, syllables: ['1'] },
  { id: 'eighth', label: 'Eighth Notes', shortLabel: '1/8', perBeat: 2, syllables: ['1', '&'] },
  { id: 'sixteenth', label: 'Sixteenth Notes', shortLabel: '1/16', perBeat: 4, syllables: ['1', 'e', '&', 'a'] },
  { id: 'triplet', label: 'Triplets', shortLabel: '1/3', perBeat: 3, syllables: ['1', 'trip', 'let'] },
  { id: 'eighth_triplet', label: 'Eighth Triplets', shortLabel: '8th 3', perBeat: 3, syllables: ['1', 'la', 'li'] },
  { id: 'sixteenth_triplet', label: 'Sixteenth Triplets', shortLabel: '16th 3', perBeat: 6, syllables: ['1', 'ta', 'la', 'ta', 'li', 'ta'] },
];

export const MUSICIAN_ROLES: MusicianRole[] = [
  'Keyboard',
  'Guitar',
  'Bass',
  'Drums',
  'Vocals',
  'Piano',
  'Other',
];

export const DEFAULT_CLICK_PROFILE: ClickProfile = {
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

export function buildAccentPattern(ts: TimeSignature): BeatAccentType[] {
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

export const DEFAULT_PRESETS: MetronomePreset[] = [
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

export const DEFAULT_SETLISTS: Setlist[] = [
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
