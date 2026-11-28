import { VocalVoiceStyle } from '../types/metronome';

const NUMBER_TOKENS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
};

interface FormantFrame {
  f1: number;
  f2: number;
  f3: number;
  durSec: number;
  /** Fraction of frame [0..0.9] held steady at target phoneme before transitioning to next frame */
  holdFrac?: number;
  pitchMul?: number;
  voiced?: number; // 0..1 glottal voicing mix
  breath?: number; // 0..1 soft glottal aspiration air
  nasal?: number; // 0..1 nasal murmur + anti-resonance blend (/m/, /n/)
  noiseGain?: number; // unvoiced consonant fricative/plosive level
  noiseFreq?: number; // consonant bandpass center Hz
  noiseQ?: number; // consonant Q (lower = broader air, higher = sharper 's'/'t')
  amp?: number; // frame envelope multiplier
}

/**
 * Articulatory phoneme formant trajectories tuned for human-like clarity and pronunciation.
 * Steady vowel holds (holdFrac), true plosive closure gaps (for 'six', 'eight', 'let'),
 * and nasal resonances (for 'one', 'seven', 'nine', 'ten', 'and') ensure every beat count
 * is crisp, intelligible, and completely free of electronic buzz.
 */
const VOCAL_RECIPES: Record<string, FormantFrame[]> = {
  one: [
    // /w/ rounded labial glide -> steady warm /ʌ/ -> nasal /n/ coda
    { f1: 295, f2: 630, f3: 2240, durSec: 0.038, holdFrac: 0.25, pitchMul: 0.96, voiced: 1, breath: 0.03, nasal: 0, amp: 0.84 },
    { f1: 665, f2: 1185, f3: 2450, durSec: 0.088, holdFrac: 0.58, pitchMul: 1.04, voiced: 1, breath: 0.025, nasal: 0.05, amp: 1.0 },
    { f1: 270, f2: 1490, f3: 2380, durSec: 0.056, holdFrac: 0.65, pitchMul: 0.94, voiced: 1, breath: 0.015, nasal: 0.88, amp: 0.62 },
  ],
  two: [
    // Crisp /t/ burst -> brief aspiration -> sustained rounded /uː/
    { f1: 380, f2: 1840, f3: 2820, durSec: 0.005, holdFrac: 0.5, pitchMul: 1.06, voiced: 0, noiseGain: 0.01, noiseFreq: 3700, noiseQ: 1.4, amp: 0.06 },
    { f1: 380, f2: 1800, f3: 2780, durSec: 0.016, holdFrac: 0.55, pitchMul: 1.06, voiced: 0, breath: 0.08, noiseGain: 0.44, noiseFreq: 3950, noiseQ: 1.65, amp: 0.95 },
    { f1: 345, f2: 1320, f3: 2420, durSec: 0.016, holdFrac: 0.15, pitchMul: 1.05, voiced: 0.65, breath: 0.24, noiseGain: 0.06, noiseFreq: 2800, noiseQ: 1.0, amp: 0.9 },
    { f1: 305, f2: 865, f3: 2260, durSec: 0.135, holdFrac: 0.78, pitchMul: 1.02, voiced: 1, breath: 0.03, noiseGain: 0, amp: 1.0 },
  ],
  three: [
    // Soft dental /θ/ -> retroflex /r/ (low F3 ~1560Hz) -> bright sustained /iː/
    { f1: 390, f2: 1620, f3: 2560, durSec: 0.034, holdFrac: 0.55, pitchMul: 1.0, voiced: 0, noiseGain: 0.21, noiseFreq: 2950, noiseQ: 0.85, amp: 0.88 },
    { f1: 355, f2: 1185, f3: 1560, durSec: 0.044, holdFrac: 0.35, pitchMul: 1.0, voiced: 1, breath: 0.03, amp: 0.94 },
    { f1: 280, f2: 2290, f3: 3040, durSec: 0.112, holdFrac: 0.74, pitchMul: 1.05, voiced: 1, breath: 0.03, amp: 1.0 },
  ],
  four: [
    // Soft labiodental /f/ -> rounded /ɔː/ -> smooth /r/ tail
    { f1: 460, f2: 1120, f3: 2380, durSec: 0.034, holdFrac: 0.55, pitchMul: 1.0, voiced: 0, noiseGain: 0.2, noiseFreq: 2150, noiseQ: 0.8, amp: 0.86 },
    { f1: 550, f2: 845, f3: 2430, durSec: 0.094, holdFrac: 0.65, pitchMul: 1.04, voiced: 1, breath: 0.03, amp: 1.0 },
    { f1: 440, f2: 1170, f3: 1630, durSec: 0.052, holdFrac: 0.5, pitchMul: 0.95, voiced: 1, breath: 0.025, amp: 0.76 },
  ],
  five: [
    // Soft /f/ -> wide /aɪ/ diphthong -> clean voiced /v/ closure
    { f1: 460, f2: 1140, f3: 2380, durSec: 0.030, holdFrac: 0.55, pitchMul: 1.0, voiced: 0, noiseGain: 0.19, noiseFreq: 2200, noiseQ: 0.82, amp: 0.86 },
    { f1: 755, f2: 1140, f3: 2470, durSec: 0.070, holdFrac: 0.52, pitchMul: 1.05, voiced: 1, breath: 0.03, amp: 1.0 },
    { f1: 400, f2: 2020, f3: 2680, durSec: 0.052, holdFrac: 0.35, pitchMul: 1.01, voiced: 1, breath: 0.025, amp: 0.92 },
    { f1: 290, f2: 1300, f3: 2340, durSec: 0.030, holdFrac: 0.6, pitchMul: 0.93, voiced: 0.9, breath: 0.02, noiseGain: 0.05, noiseFreq: 1950, noiseQ: 0.95, amp: 0.54 },
  ],
  six: [
    // Crisp /s/ -> bright /ɪ/ -> true /k/ silence gap -> crisp /k/ burst -> clean /s/
    { f1: 400, f2: 1900, f3: 2760, durSec: 0.038, holdFrac: 0.65, pitchMul: 1.02, voiced: 0, noiseGain: 0.34, noiseFreq: 5400, noiseQ: 2.3, amp: 0.9 },
    { f1: 405, f2: 1960, f3: 2620, durSec: 0.072, holdFrac: 0.66, pitchMul: 1.05, voiced: 1, breath: 0.025, amp: 1.0 },
    { f1: 380, f2: 1850, f3: 2560, durSec: 0.022, holdFrac: 0.8, pitchMul: 0.98, voiced: 0, noiseGain: 0, amp: 0.04 },
    { f1: 420, f2: 1880, f3: 2620, durSec: 0.014, holdFrac: 0.6, pitchMul: 1.0, voiced: 0, noiseGain: 0.42, noiseFreq: 2250, noiseQ: 1.35, amp: 0.92 },
    { f1: 400, f2: 1860, f3: 2720, durSec: 0.032, holdFrac: 0.6, pitchMul: 0.98, voiced: 0, noiseGain: 0.3, noiseFreq: 5250, noiseQ: 2.1, amp: 0.84 },
  ],
  seven: [
    // Crisp /s/ -> open /ɛ/ -> voiced /v/ -> nasal schwa /ən/
    { f1: 410, f2: 1880, f3: 2720, durSec: 0.035, holdFrac: 0.65, pitchMul: 1.02, voiced: 0, noiseGain: 0.32, noiseFreq: 5300, noiseQ: 2.25, amp: 0.88 },
    { f1: 575, f2: 1810, f3: 2520, durSec: 0.068, holdFrac: 0.6, pitchMul: 1.06, voiced: 1, breath: 0.025, amp: 1.0 },
    { f1: 315, f2: 1350, f3: 2360, durSec: 0.024, holdFrac: 0.45, pitchMul: 0.98, voiced: 0.9, breath: 0.02, noiseGain: 0.04, noiseFreq: 2050, noiseQ: 0.95, amp: 0.58 },
    { f1: 415, f2: 1410, f3: 2350, durSec: 0.050, holdFrac: 0.6, pitchMul: 0.94, voiced: 1, breath: 0.02, nasal: 0.72, amp: 0.74 },
  ],
  eight: [
    // Smooth /eɪ/ diphthong -> distinct /t/ silence closure -> crisp /t/ burst
    { f1: 490, f2: 1960, f3: 2620, durSec: 0.068, holdFrac: 0.56, pitchMul: 1.05, voiced: 1, breath: 0.025, amp: 1.0 },
    { f1: 325, f2: 2270, f3: 2880, durSec: 0.048, holdFrac: 0.35, pitchMul: 1.02, voiced: 1, breath: 0.02, amp: 0.88 },
    { f1: 370, f2: 1860, f3: 2760, durSec: 0.026, holdFrac: 0.85, pitchMul: 1.0, voiced: 0, noiseGain: 0, amp: 0.03 },
    { f1: 430, f2: 1900, f3: 2820, durSec: 0.022, holdFrac: 0.55, pitchMul: 1.0, voiced: 0, noiseGain: 0.38, noiseFreq: 3950, noiseQ: 1.65, amp: 0.9 },
  ],
  nine: [
    { f1: 275, f2: 1520, f3: 2400, durSec: 0.036, holdFrac: 0.45, pitchMul: 0.96, voiced: 1, breath: 0.02, nasal: 0.85, amp: 0.72 },
    { f1: 745, f2: 1130, f3: 2470, durSec: 0.072, holdFrac: 0.5, pitchMul: 1.06, voiced: 1, breath: 0.03, nasal: 0.08, amp: 1.0 },
    { f1: 390, f2: 1990, f3: 2660, durSec: 0.044, holdFrac: 0.3, pitchMul: 0.99, voiced: 1, breath: 0.02, nasal: 0.25, amp: 0.86 },
    { f1: 270, f2: 1510, f3: 2390, durSec: 0.034, holdFrac: 0.65, pitchMul: 0.94, voiced: 1, breath: 0.015, nasal: 0.88, amp: 0.6 },
  ],
  ten: [
    { f1: 430, f2: 1860, f3: 2780, durSec: 0.020, holdFrac: 0.55, pitchMul: 1.05, voiced: 0, breath: 0.08, noiseGain: 0.42, noiseFreq: 3900, noiseQ: 1.6, amp: 0.95 },
    { f1: 575, f2: 1800, f3: 2520, durSec: 0.084, holdFrac: 0.62, pitchMul: 1.04, voiced: 1, breath: 0.025, amp: 1.0 },
    { f1: 275, f2: 1480, f3: 2400, durSec: 0.046, holdFrac: 0.65, pitchMul: 0.94, voiced: 1, breath: 0.015, nasal: 0.85, amp: 0.66 },
  ],
  eleven: [
    { f1: 390, f2: 1920, f3: 2580, durSec: 0.038, holdFrac: 0.45, pitchMul: 0.97, voiced: 1, breath: 0.025, amp: 0.86 },
    { f1: 565, f2: 1790, f3: 2520, durSec: 0.074, holdFrac: 0.6, pitchMul: 1.06, voiced: 1, breath: 0.03, amp: 1.0 },
    { f1: 420, f2: 1380, f3: 2360, durSec: 0.048, holdFrac: 0.6, pitchMul: 0.94, voiced: 1, breath: 0.02, nasal: 0.72, amp: 0.72 },
  ],
  twelve: [
    { f1: 430, f2: 1860, f3: 2780, durSec: 0.020, holdFrac: 0.55, pitchMul: 1.04, voiced: 0, noiseGain: 0.36, noiseFreq: 3850, noiseQ: 1.6, amp: 0.92 },
    { f1: 315, f2: 860, f3: 2260, durSec: 0.034, holdFrac: 0.3, pitchMul: 1.0, voiced: 1, breath: 0.025, amp: 0.9 },
    { f1: 560, f2: 1740, f3: 2480, durSec: 0.092, holdFrac: 0.64, pitchMul: 1.04, voiced: 1, breath: 0.025, amp: 1.0 },
  ],
  thirteen: [
    { f1: 410, f2: 1620, f3: 2540, durSec: 0.026, holdFrac: 0.5, pitchMul: 1.0, voiced: 0, noiseGain: 0.2, noiseFreq: 2950, noiseQ: 0.88, amp: 0.88 },
    { f1: 485, f2: 1340, f3: 1650, durSec: 0.060, holdFrac: 0.55, pitchMul: 0.98, voiced: 1, breath: 0.03, amp: 0.95 },
    { f1: 280, f2: 2260, f3: 3000, durSec: 0.076, holdFrac: 0.65, pitchMul: 1.06, voiced: 1, breath: 0.025, nasal: 0.2, amp: 1.0 },
  ],
  fourteen: [
    { f1: 460, f2: 1120, f3: 2380, durSec: 0.024, holdFrac: 0.5, pitchMul: 1.0, voiced: 0, noiseGain: 0.19, noiseFreq: 2150, noiseQ: 0.8, amp: 0.88 },
    { f1: 550, f2: 850, f3: 2420, durSec: 0.062, holdFrac: 0.58, pitchMul: 1.0, voiced: 1, breath: 0.025, amp: 0.96 },
    { f1: 280, f2: 2260, f3: 3000, durSec: 0.076, holdFrac: 0.65, pitchMul: 1.06, voiced: 1, breath: 0.025, nasal: 0.2, amp: 1.0 },
  ],
  fifteen: [
    { f1: 460, f2: 1140, f3: 2380, durSec: 0.024, holdFrac: 0.5, pitchMul: 1.0, voiced: 0, noiseGain: 0.19, noiseFreq: 2200, noiseQ: 0.8, amp: 0.88 },
    { f1: 405, f2: 1940, f3: 2580, durSec: 0.054, holdFrac: 0.55, pitchMul: 0.98, voiced: 1, breath: 0.025, amp: 0.94 },
    { f1: 280, f2: 2260, f3: 3000, durSec: 0.076, holdFrac: 0.65, pitchMul: 1.06, voiced: 1, breath: 0.025, nasal: 0.2, amp: 1.0 },
  ],
  sixteen: [
    { f1: 400, f2: 1900, f3: 2700, durSec: 0.028, holdFrac: 0.55, pitchMul: 1.02, voiced: 0, noiseGain: 0.3, noiseFreq: 5200, noiseQ: 2.2, amp: 0.9 },
    { f1: 405, f2: 1940, f3: 2580, durSec: 0.052, holdFrac: 0.55, pitchMul: 0.98, voiced: 1, breath: 0.025, amp: 0.94 },
    { f1: 280, f2: 2260, f3: 3000, durSec: 0.076, holdFrac: 0.65, pitchMul: 1.06, voiced: 1, breath: 0.025, nasal: 0.2, amp: 1.0 },
  ],
  // Crisp, light subdivision syllables (clear vowel targets, zero buzz)
  and: [
    { f1: 655, f2: 1740, f3: 2480, durSec: 0.048, holdFrac: 0.55, pitchMul: 1.12, voiced: 1, breath: 0.03, amp: 1.0 },
    { f1: 310, f2: 1490, f3: 2380, durSec: 0.032, holdFrac: 0.6, pitchMul: 1.05, voiced: 1, breath: 0.02, nasal: 0.78, amp: 0.66 },
  ],
  e: [
    { f1: 280, f2: 2290, f3: 3040, durSec: 0.064, holdFrac: 0.75, pitchMul: 1.16, voiced: 1, breath: 0.03, amp: 1.0 },
  ],
  a: [
    { f1: 635, f2: 1240, f3: 2440, durSec: 0.064, holdFrac: 0.75, pitchMul: 1.04, voiced: 1, breath: 0.03, amp: 1.0 },
  ],
  trip: [
    { f1: 430, f2: 1850, f3: 2700, durSec: 0.015, holdFrac: 0.5, pitchMul: 1.06, voiced: 0, noiseGain: 0.28, noiseFreq: 3700, noiseQ: 1.5, amp: 0.9 },
    { f1: 405, f2: 1920, f3: 2560, durSec: 0.056, holdFrac: 0.6, pitchMul: 1.08, voiced: 1, breath: 0.025, amp: 1.0 },
  ],
  let: [
    { f1: 545, f2: 1760, f3: 2480, durSec: 0.054, holdFrac: 0.6, pitchMul: 1.04, voiced: 1, breath: 0.025, amp: 1.0 },
    { f1: 380, f2: 1850, f3: 2700, durSec: 0.012, holdFrac: 0.8, pitchMul: 1.0, voiced: 0, noiseGain: 0, amp: 0.04 },
    { f1: 420, f2: 1860, f3: 2740, durSec: 0.015, holdFrac: 0.5, pitchMul: 1.0, voiced: 0, noiseGain: 0.25, noiseFreq: 3800, noiseQ: 1.6, amp: 0.8 },
  ],
  ta: [
    { f1: 430, f2: 1820, f3: 2700, durSec: 0.014, holdFrac: 0.5, pitchMul: 1.06, voiced: 0, noiseGain: 0.26, noiseFreq: 3700, noiseQ: 1.5, amp: 0.9 },
    { f1: 580, f2: 1280, f3: 2420, durSec: 0.054, holdFrac: 0.65, pitchMul: 1.08, voiced: 1, breath: 0.025, amp: 1.0 },
  ],
  la: [{ f1: 580, f2: 1240, f3: 2420, durSec: 0.062, holdFrac: 0.7, pitchMul: 1.1, voiced: 1, breath: 0.025, amp: 1.0 }],
  li: [{ f1: 295, f2: 2210, f3: 2900, durSec: 0.062, holdFrac: 0.7, pitchMul: 1.14, voiced: 1, breath: 0.025, amp: 1.0 }],
  go: [
    { f1: 315, f2: 1360, f3: 2320, durSec: 0.022, holdFrac: 0.35, pitchMul: 1.02, voiced: 1, breath: 0.025, amp: 0.9 },
    { f1: 515, f2: 910, f3: 2380, durSec: 0.078, holdFrac: 0.6, pitchMul: 1.12, voiced: 1, breath: 0.03, amp: 1.0 },
    { f1: 360, f2: 760, f3: 2260, durSec: 0.065, holdFrac: 0.6, pitchMul: 1.05, voiced: 1, breath: 0.02, amp: 0.82 },
  ],
};

export interface ScheduleVocalOptions {
  volume: number;
  bpm: number;
  isAccent?: boolean;
  isSubdivision?: boolean;
  subdivisionsPerBeat?: number;
  pitchBoost?: number;
  vocalStyle?: VocalVoiceStyle;
  destination?: AudioNode;
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface CascadeState {
  y1: number;
  y2: number;
}

/**
 * AudioVocalizer synthesizes and schedules sample-accurate, IEM-safe vocal count
 * cues ('1', '2', '3', '4', ...) directly on a Web Audio API AudioContext timeline.
 *
 * Uses a smooth anti-aliased Liljencrants-Fant (LF) glottal flow derivative source
 * driving a true all-pole Klatt cascade vocal tract (F5->F4->F3->F2->F1 + nasal branch),
 * producing warm, articulate human-style pronunciation with zero synthetic buzz.
 */
export class AudioVocalizer {
  private bufferCache = new Map<string, AudioBuffer>();
  private activeVoices = new Set<ActiveVoice>();
  private cachedSampleRate = 0;

  public getBeatToken(beatNumberOneBased: number): string {
    return NUMBER_TOKENS[beatNumberOneBased] ?? 'one';
  }

  public stopAll(ctx?: AudioContext): void {
    const now = ctx ? ctx.currentTime : null;
    for (const voice of this.activeVoices) {
      try {
        if (now !== null) {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
          voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);
          voice.source.stop(now + 0.018);
        } else {
          voice.gain.gain.value = 0;
          voice.source.stop();
          voice.source.disconnect();
          voice.gain.disconnect();
        }
      } catch {
        // Ignore already-stopped nodes
      }
    }
    if (now === null) {
      this.activeVoices.clear();
    }
  }

  private resolveStyle(
    vocalStyle: VocalVoiceStyle | undefined,
    bpm: number,
    subdivisionsPerBeat: number
  ): 'natural' | 'studio' {
    if (vocalStyle === 'natural') return 'natural';
    if (vocalStyle === 'studio') return 'studio';
    return subdivisionsPerBeat > 1 || bpm >= 115 ? 'studio' : 'natural';
  }

  public preloadStandardCounts(
    ctx: AudioContext,
    vocalStyle: VocalVoiceStyle = 'natural'
  ): void {
    const resolved: 'natural' | 'studio' = vocalStyle === 'studio' ? 'studio' : 'natural';
    for (const num of [1, 2, 3, 4, 5, 6, 7, 8]) {
      this.getOrCreateBuffer(ctx, this.getBeatToken(num), resolved);
    }
    this.getOrCreateBuffer(ctx, 'and', resolved);
    this.getOrCreateBuffer(ctx, 'e', resolved);
    this.getOrCreateBuffer(ctx, 'a', resolved);
  }

  public scheduleBeatCount(
    ctx: AudioContext,
    beatNumberOneBased: number,
    when: number,
    options: ScheduleVocalOptions
  ): void {
    const token = this.getBeatToken(beatNumberOneBased);
    this.scheduleToken(ctx, token, when, options);
  }

  public scheduleToken(
    ctx: AudioContext,
    token: string,
    when: number,
    options: ScheduleVocalOptions
  ): void {
    const {
      volume,
      bpm,
      isAccent = false,
      isSubdivision = false,
      subdivisionsPerBeat = 1,
      pitchBoost,
      vocalStyle = 'auto',
      destination,
    } = options;
    if (volume <= 0.005) return;

    const resolvedStyle = this.resolveStyle(vocalStyle, bpm, subdivisionsPerBeat);
    const buffer = this.getOrCreateBuffer(ctx, token, resolvedStyle);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const subDiv = Math.max(1, subdivisionsPerBeat);
    const slotSec = 60 / Math.max(20, bpm) / subDiv;
    // Allow full word articulation to complete cleanly inside rapid beats & 1/16 subdivisions
    const tempoFitBoost =
      buffer.duration > slotSec * 0.85
        ? Math.min(subDiv >= 4 ? 1.55 : 1.32, Math.max(1.0, buffer.duration / (slotSec * 0.88)))
        : 1.0;

    const baseRate = pitchBoost ?? (isAccent ? 1.04 : isSubdivision ? 1.03 : 1.0);
    const rate = baseRate * tempoFitBoost;
    source.playbackRate.setValueAtTime(rate, when);

    const effectiveBufferDur = buffer.duration / rate;
    const capRatio = subDiv > 1 ? 0.94 : isSubdivision ? 0.56 : 0.88;
    const maxPlaySec = Math.max(0.045, Math.min(effectiveBufferDur, slotSec * capRatio));

    const gainNode = ctx.createGain();
    const scale = isSubdivision ? 0.62 : isAccent ? 1.04 : 0.96;
    const level = Math.min(0.92, Math.max(0.0001, volume * scale));
    const fadeInEnd = when + Math.min(0.007, maxPlaySec * 0.16);
    const fadeOutStart = when + Math.max(0.016, maxPlaySec - 0.026);
    const fadeOutEnd = when + maxPlaySec;

    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(level, fadeInEnd);
    gainNode.gain.setValueAtTime(level, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, fadeOutEnd);

    source.connect(gainNode);
    gainNode.connect(destination ?? ctx.destination);

    const voice: ActiveVoice = { source, gain: gainNode };
    this.activeVoices.add(voice);
    source.onended = () => {
      this.activeVoices.delete(voice);
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
    };

    source.start(when);
    source.stop(fadeOutEnd + 0.015);
  }

  public scheduleBarCountdown(
    ctx: AudioContext,
    beatsInBar: number,
    barStartWhen: number,
    options: ScheduleVocalOptions
  ): void {
    const count = Math.max(1, Math.min(16, beatsInBar));
    const beatSec = 60 / options.bpm;
    for (let i = 0; i < count; i++) {
      this.scheduleBeatCount(ctx, i + 1, barStartWhen + i * beatSec, {
        ...options,
        isAccent: i === 0,
        isSubdivision: false,
      });
    }
  }

  public previewBarCount(
    ctx: AudioContext,
    volume = 0.9,
    bpm = 120,
    destination?: AudioNode,
    vocalStyle: VocalVoiceStyle = 'auto'
  ): void {
    this.stopAll(ctx);
    const resolvedStyle = this.resolveStyle(vocalStyle, bpm, 1);
    this.preloadStandardCounts(ctx, resolvedStyle);
    this.scheduleBarCountdown(ctx, 4, ctx.currentTime + 0.03, {
      volume,
      bpm,
      vocalStyle,
      destination,
    });
  }

  private getOrCreateBuffer(
    ctx: AudioContext,
    token: string,
    style: 'natural' | 'studio' = 'natural'
  ): AudioBuffer {
    if (this.cachedSampleRate !== ctx.sampleRate) {
      this.bufferCache.clear();
      this.cachedSampleRate = ctx.sampleRate;
    }

    const cleanToken = token.toLowerCase();
    const key = `${cleanToken}:${style}`;
    const existing = this.bufferCache.get(key);
    if (existing) return existing;

    const frames = VOCAL_RECIPES[cleanToken] ?? VOCAL_RECIPES.one;
    const buffer = this.renderCascadeVocalBuffer(ctx, frames, style);
    this.bufferCache.set(key, buffer);
    return buffer;
  }

  private renderCascadeVocalBuffer(
    ctx: AudioContext,
    frames: FormantFrame[],
    style: 'natural' | 'studio'
  ): AudioBuffer {
    const sr = ctx.sampleRate;
    const isNatural = style === 'natural';
    const activeDur = frames.reduce((acc, f) => acc + f.durSec, 0);
    const activeSamples = Math.max(1, Math.floor(sr * activeDur));
    // 18ms trailing silence guarantees clean stop boundaries with zero click
    const padSamples = Math.floor(sr * 0.018);
    const totalSamples = activeSamples + padSamples;
    const buffer = ctx.createBuffer(1, totalSamples, sr);
    const out = buffer.getChannelData(0);

    // Clear natural speaking pitch: warm baritone-tenor (Natural) vs bright stage tenor (Studio)
    const basePitchHz = isNatural ? 142 : 168;
    let phase = 0;
    let cursor = 0;

    const makeCascade = (): CascadeState => ({ y1: 0, y2: 0 });
    const f5State = makeCascade();
    const f4State = makeCascade();
    const f3State = makeCascade();
    const f2State = makeCascade();
    const f1State = makeCascade();
    const f2FrontState = makeCascade();
    const nasalPoleState = makeCascade();

    const makeBiquad = (): BiquadState => ({ x1: 0, x2: 0, y1: 0, y2: 0 });
    const nasalZeroState = makeBiquad();
    const chestState = makeBiquad();
    const presenceState = makeBiquad();
    const consonantHp = makeBiquad();
    const consonantBp = makeBiquad();
    const hpState = makeBiquad();
    const lpState = makeBiquad();

    // Natural -6dB/oct glottal spectral rolloff above ~2.0-2.4kHz keeps F2/F3 vowels clear while preventing high-frequency buzz
    const tiltCutoff = isNatural ? 1950 : 2350;
    const tiltCoeff = Math.exp((-2 * Math.PI * tiltCutoff) / sr);
    let tilt1 = 0;
    let prevVowel = 0;

    // Klatt 2-pole all-pole formant resonator (DC gain strictly 1.0, zero phase cancellation)
    const stepAllPoleResonator = (
      state: CascadeState,
      x: number,
      freq: number,
      bwHz: number
    ): number => {
      const clampedFreq = Math.min(sr * 0.43, Math.max(85, freq));
      const bw = Math.max(38, bwHz);
      const r = Math.exp((-Math.PI * bw) / sr);
      const theta = (2 * Math.PI * clampedFreq) / sr;
      const c = -(r * r);
      const b = 2 * r * Math.cos(theta);
      const a = 1 - b - c;
      const y = a * x + b * state.y1 + c * state.y2;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    // Bandpass resonator for shaped unvoiced consonant noise (/s/, /t/, /f/, /k/)
    const stepBandpass = (state: BiquadState, x: number, freq: number, bwHz: number): number => {
      const clampedFreq = Math.min(sr * 0.43, Math.max(120, freq));
      const q = Math.max(0.7, clampedFreq / Math.max(80, bwHz));
      const w0 = (2 * Math.PI * clampedFreq) / sr;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / (2 * q);
      const a0 = 1 + alpha;
      const y = (alpha * x - alpha * state.x2 + 2 * cosW0 * state.y1 - (1 - alpha) * state.y2) / a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    // Gentle notch filter for nasal anti-formant (~1080Hz) during /n/ and /m/
    const stepNotch = (state: BiquadState, x: number, freq: number, q: number): number => {
      const w0 = (2 * Math.PI * Math.min(sr * 0.43, freq)) / sr;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / (2 * q);
      const a0 = 1 + alpha;
      const b0 = 1;
      const b1 = -2 * cosW0;
      const b2 = 1;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha;
      const y = (b0 * x + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2) / a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    const stepPeaking = (state: BiquadState, x: number, freq: number, q: number, gainDb: number): number => {
      const A = Math.pow(10, gainDb / 40);
      const w0 = (2 * Math.PI * Math.min(sr * 0.43, freq)) / sr;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / (2 * q);
      const b0 = 1 + alpha * A;
      const b1 = -2 * cosW0;
      const b2 = 1 - alpha * A;
      const a0 = 1 + alpha / A;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha / A;
      const y = (b0 * x + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2) / a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    const stepHighpass = (state: BiquadState, x: number, freq: number): number => {
      const w0 = (2 * Math.PI * freq) / sr;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / Math.SQRT2;
      const a0 = 1 + alpha;
      const b0 = (1 + cosW0) / 2;
      const b1 = -(1 + cosW0);
      const b2 = (1 + cosW0) / 2;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha;
      const y = (b0 * x + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2) / a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    const stepLowpass = (state: BiquadState, x: number, freq: number): number => {
      const w0 = (2 * Math.PI * freq) / sr;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / Math.SQRT2;
      const a0 = 1 + alpha;
      const b0 = (1 - cosW0) / 2;
      const b1 = 1 - cosW0;
      const b2 = (1 - cosW0) / 2;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha;
      const y = (b0 * x + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2) / a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    // C1-continuous Liljencrants-Fant (LF) glottal flow derivative with calibrated return phase (tr ~0.058):
    // Excitates natural 1-2.8kHz F2/F3 vowel formants cleanly while avoiding sawtooth/step discontinuities
    const tp = isNatural ? 0.42 : 0.40;
    const te = isNatural ? 0.58 : 0.56;
    const tr = isNatural ? 0.062 : 0.055;
    const evalRawLf = (p: number): number => {
      if (p < tp) {
        return 0.44 * Math.pow(Math.sin((Math.PI * p) / tp), 1.35);
      }
      if (p < te) {
        const closeT = (p - tp) / Math.max(0.01, te - tp);
        return -0.5 * (1 - Math.cos(Math.PI * closeT));
      }
      if (p < te + tr) {
        const retT = (p - te) / tr;
        return -0.5 * (1 + Math.cos(Math.PI * retT));
      }
      return 0;
    };

    let lfDcSum = 0;
    const dcEvalSteps = 256;
    for (let k = 0; k < dcEvalSteps; k++) {
      lfDcSum += evalRawLf((k + 0.5) / dcEvalSteps);
    }
    const lfDcOffset = lfDcSum / dcEvalSteps;

    const sampleBandlimitedLf = (p: number, dp: number): number => {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const subP = (p + ((k - 1.5) * 0.25) * dp + 1) % 1;
        sum += evalRawLf(subP) - lfDcOffset;
      }
      return sum * 0.25;
    };

    const bw1 = isNatural ? 78 : 72;
    const bw2 = isNatural ? 92 : 84;
    const bw3 = isNatural ? 126 : 114;
    const bw4 = isNatural ? 210 : 190;
    const chestGainDb = isNatural ? 0.5 : -0.5;
    const presenceFreq = isNatural ? 2150 : 2320;
    const presenceGainDb = isNatural ? 5.2 : 6.2;
    const outputLowpassHz = isNatural ? 4200 : 4800;

    let pinkNoise = 0;

    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
      const frame = frames[fIdx];
      const next = frames[fIdx + 1] ?? frame;
      const count =
        fIdx === frames.length - 1
          ? Math.max(1, activeSamples - cursor)
          : Math.max(1, Math.floor(frame.durSec * sr));

      const holdFrac = Math.max(0, Math.min(0.88, frame.holdFrac ?? 0.4));
      const startVoiced = frame.voiced ?? 1;
      const endVoiced = next.voiced ?? startVoiced;
      const startPitch = frame.pitchMul ?? 1.0;
      const endPitch = next.pitchMul ?? startPitch;
      const startBreath = frame.breath ?? 0.025;
      const endBreath = next.breath ?? startBreath;
      const startNasal = frame.nasal ?? 0.0;
      const endNasal = next.nasal ?? startNasal;
      const startNoise = frame.noiseGain ?? 0.0;
      const endNoise = next.noiseGain ?? startNoise;
      const startNoiseFreq = frame.noiseFreq ?? 3200;
      const endNoiseFreq = next.noiseFreq ?? startNoiseFreq;
      const startNoiseQ = frame.noiseQ ?? 1.4;
      const endNoiseQ = next.noiseQ ?? startNoiseQ;
      const startAmp = frame.amp ?? 1.0;
      const endAmp = next.amp ?? startAmp;

      for (let i = 0; i < count && cursor < activeSamples; i++) {
        const rawT = i / Math.max(1, count);
        // Hold steady on the phoneme center before gliding smoothly into the next phoneme
        const glideT = rawT <= holdFrac ? 0 : (rawT - holdFrac) / Math.max(0.01, 1 - holdFrac);
        const s = glideT * glideT * (3 - 2 * glideT);

        const f1 = frame.f1 + (next.f1 - frame.f1) * s;
        const f2 = frame.f2 + (next.f2 - frame.f2) * s;
        const f3 = frame.f3 + (next.f3 - frame.f3) * s;
        const f4 = Math.min(3900, Math.max(3150, (isNatural ? 3440 : 3560) + (f3 - 2400) * 0.22));
        const pitchMul = startPitch + (endPitch - startPitch) * s;
        const voicedMix = startVoiced + (endVoiced - startVoiced) * s;
        const breathMix = startBreath + (endBreath - startBreath) * s;
        const nasalMix = startNasal + (endNasal - startNasal) * s;
        const noiseAmp = startNoise + (endNoise - startNoise) * s;
        const noiseFreq = startNoiseFreq + (endNoiseFreq - startNoiseFreq) * s;
        const noiseQ = startNoiseQ + (endNoiseQ - startNoiseQ) * s;
        const frameAmp = startAmp + (endAmp - startAmp) * s;

        // Smooth human cadence arc across syllable + subtle natural vibrato drift
        const progress = cursor / activeSamples;
        const prosodyArc = isNatural
          ? 1.0 + Math.sin(progress * Math.PI) * 0.042 - progress * 0.05
          : 1.015 + Math.sin(progress * Math.PI) * 0.028 - progress * 0.036;
        const microDrift = 1 + Math.sin((cursor / sr) * 26.0) * 0.0022;

        let glottalSource = 0;
        if (voicedMix > 0.001) {
          const pitch = basePitchHz * pitchMul * prosodyArc * microDrift;
          const dp = pitch / sr;
          phase += dp;
          if (phase >= 1) phase -= 1;

          const rawLf = sampleBandlimitedLf(phase, dp);
          tilt1 = (1 - tiltCoeff) * rawLf + tiltCoeff * tilt1;

          // Subtle natural glottal airiness (only while vocal folds are open)
          const openWindow = phase < te ? Math.sin((Math.PI * phase) / te) : 0;
          const breathNoise = (Math.random() * 2 - 1) * breathMix * (0.45 + 0.55 * openWindow);
          glottalSource = (tilt1 * 1.45 + breathNoise) * voicedMix;
        }

        // True acoustic cascade vocal tract: F5 -> F4 -> F3 -> F2 -> F1 (zero parallel raw buzz)
        // Physiological vocal tract wall loss widens BW1 on close vowels (/i/, /u/) so F1 doesn't mask F2
        const dynBw1 = f1 < 380 ? bw1 * 1.55 : bw1;
        const dynBw2 = f2 > 1650 ? bw2 * 0.78 : bw2;
        const dynBw3 = f2 > 1650 ? bw3 * 0.82 : bw3;
        let tract = stepAllPoleResonator(f5State, glottalSource, isNatural ? 4300 : 4450, 320);
        tract = stepAllPoleResonator(f4State, tract, f4, bw4);
        tract = stepAllPoleResonator(f3State, tract, f3, dynBw3);
        tract = stepAllPoleResonator(f2State, tract, f2, dynBw2);
        tract = stepAllPoleResonator(f1State, tract, f1, dynBw1);
        // Clean front-vowel F2 resonance clarity (/i/, /ei/, /I/) driven smoothly from tilted glottal wave
        const f2FrontPeak = stepAllPoleResonator(f2FrontState, glottalSource, f2, dynBw2);
        if (f2 > 1550 && voicedMix > 0.05) {
          const frontBlend = Math.min(1, (f2 - 1550) / 600);
          tract += f2FrontPeak * 0.22 * frontBlend;
        }

        // Nasal murmur resonance + oral anti-formant notch for /n/ and /m/ clarity
        if (nasalMix > 0.01) {
          const dampedOral = stepNotch(nasalZeroState, tract, 1080, 2.4);
          const nasalMurmur = stepAllPoleResonator(nasalPoleState, glottalSource * 0.72, 265, 68);
          tract = dampedOral * (1 - nasalMix * 0.45) + nasalMurmur * nasalMix * 0.68;
        }

        // True +6dB/oct lip-radiation differentiation balances F1/F2/F3 naturally like human speech
        const radiated = tract - prevVowel * 0.94;
        prevVowel = tract;

        // Clear shaped air for unvoiced consonants (/s/, /t/, /f/, /k/, /th/) balanced clearly with vowels
        const w = Math.random() * 2 - 1;
        pinkNoise = pinkNoise * 0.42 + w * 0.58;
        const brightAir = stepHighpass(consonantHp, w, 1750);
        const exciterNoise = noiseFreq >= 2850 ? brightAir : pinkNoise;
        const bwConsonant = Math.max(240, noiseFreq / Math.max(0.8, noiseQ));
        const consonantScale = isNatural ? 1.05 : 1.15;
        const consonantOut =
          stepBandpass(consonantBp, exciterNoise, noiseFreq, bwConsonant) *
          noiseAmp *
          consonantScale *
          0.95;

        let sample = (radiated + consonantOut) * frameAmp;

        // Calibrated vocal clarity EQ (strictly linear — zero distortion buzz)
        sample = stepPeaking(chestState, sample, 195, 0.85, chestGainDb);
        sample = stepPeaking(presenceState, sample, presenceFreq, 0.72, presenceGainDb);
        sample = stepHighpass(hpState, sample, 110);
        // Let bright /s/ sibilants breathe up to 6.8kHz during consonants, keep vowels smooth
        const dynamicLpHz = noiseAmp > 0.18 && noiseFreq > 3500 ? 6800 : outputLowpassHz;
        sample = stepLowpass(lpState, sample, dynamicLpHz);

        // Smooth cosine attack (7ms) and release (24ms) to pure zero silence
        const attackSamples = sr * 0.007;
        const releaseSamples = sr * 0.024;
        const attackEnv =
          cursor < attackSamples ? 0.5 * (1 - Math.cos((Math.PI * cursor) / attackSamples)) : 1;
        const rem = activeSamples - 1 - cursor;
        const releaseEnv =
          rem < releaseSamples ? 0.5 * (1 - Math.cos((Math.PI * rem) / releaseSamples)) : 1;

        out[cursor] = sample * attackEnv * releaseEnv;
        cursor++;
      }
    }

    // Pure linear peak + RMS leveling so all counts ('one'..'eight') sit evenly without clipping
    let sumSq = 0;
    let maxAbs = 0;
    for (let i = 0; i < activeSamples; i++) {
      const s = out[i];
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > maxAbs) maxAbs = a;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, activeSamples));
    if (rms > 0.0005 && maxAbs > 0.0005) {
      const targetGain = Math.min(0.82 / maxAbs, 0.21 / rms);
      for (let i = 0; i < activeSamples; i++) {
        out[i] *= targetGain;
      }
    }

    return buffer;
  }
}

export const sharedAudioVocalizer = new AudioVocalizer();
