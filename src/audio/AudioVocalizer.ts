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
  pitchMul?: number;
  voiced?: number; // 0..1 glottal voicing mix
  breath?: number; // 0..1 natural aspiration breathiness
  noiseGain?: number; // consonant fricative/plosive level
  noiseFreq?: number; // consonant center Hz
  noiseQ?: number; // consonant resonance Q (lower = broader air, higher = sharper 's'/'t')
  amp?: number; // frame envelope multiplier
}

/**
 * Calibrated human vocal tract phoneme trajectories (Hz & timing tuned for studio clarity).
 * Plosive bursts ('t', 'k') & sibilants ('s', 'f', 'th') use crisp unvoiced air excitation
 * feeding into smooth cascade vowel transitions so every beat ('1, 2, 3, 4') and subdivision
 * ('and', 'e and a') cuts cleanly through dense band & IEM mixes.
 */
const VOCAL_RECIPES: Record<string, FormantFrame[]> = {
  one: [
    // /w/ labial glide -> open /ʌ/ -> clean /n/ nasal resonance
    { f1: 310, f2: 720, f3: 2300, durSec: 0.042, pitchMul: 0.96, voiced: 1, breath: 0.06, amp: 0.85 },
    { f1: 640, f2: 1180, f3: 2480, durSec: 0.092, pitchMul: 1.05, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 310, f2: 1480, f3: 2420, durSec: 0.046, pitchMul: 0.94, voiced: 1, breath: 0.02, amp: 0.72 },
  ],
  two: [
    // Crisp alveolar stop burst /t/ -> rounded pure /uː/
    { f1: 380, f2: 1850, f3: 2900, durSec: 0.007, pitchMul: 1.06, voiced: 0, noiseGain: 0.02, noiseFreq: 3600, noiseQ: 1.4, amp: 0.1 },
    { f1: 380, f2: 1850, f3: 2900, durSec: 0.022, pitchMul: 1.06, voiced: 0.05, noiseGain: 0.42, noiseFreq: 3900, noiseQ: 1.6, amp: 1.0 },
    { f1: 300, f2: 860, f3: 2240, durSec: 0.132, pitchMul: 1.03, voiced: 1, breath: 0.05, noiseGain: 0.04, noiseFreq: 2600, noiseQ: 1.2, amp: 1.0 },
  ],
  three: [
    // Soft dental /θ/ -> distinctive /r/ F3 dip (~1620Hz) -> bright clear /iː/
    { f1: 400, f2: 1650, f3: 2600, durSec: 0.028, pitchMul: 1.0, voiced: 0.1, noiseGain: 0.28, noiseFreq: 3200, noiseQ: 1.1, amp: 0.9 },
    { f1: 360, f2: 1280, f3: 1620, durSec: 0.038, pitchMul: 1.01, voiced: 1, breath: 0.06, amp: 0.96 },
    { f1: 285, f2: 2260, f3: 3020, durSec: 0.105, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  four: [
    // Crisp labiodental /f/ -> rich rounded /ɔː/ -> subtle /r/ F3 dip
    { f1: 460, f2: 1120, f3: 2400, durSec: 0.030, pitchMul: 1.0, voiced: 0.05, noiseGain: 0.28, noiseFreq: 2350, noiseQ: 1.0, amp: 0.9 },
    { f1: 560, f2: 860, f3: 2420, durSec: 0.095, pitchMul: 1.04, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 450, f2: 1220, f3: 1680, durSec: 0.046, pitchMul: 0.95, voiced: 1, breath: 0.04, amp: 0.8 },
  ],
  five: [
    // Crisp /f/ -> wide /aɪ/ diphthong -> voiced /v/ tail
    { f1: 460, f2: 1150, f3: 2400, durSec: 0.028, pitchMul: 1.0, voiced: 0.05, noiseGain: 0.26, noiseFreq: 2400, noiseQ: 1.0, amp: 0.9 },
    { f1: 730, f2: 1120, f3: 2480, durSec: 0.072, pitchMul: 1.05, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 410, f2: 1980, f3: 2660, durSec: 0.048, pitchMul: 1.01, voiced: 1, breath: 0.04, amp: 0.92 },
    { f1: 320, f2: 1400, f3: 2380, durSec: 0.022, pitchMul: 0.94, voiced: 0.85, noiseGain: 0.09, noiseFreq: 2100, noiseQ: 1.1, amp: 0.65 },
  ],
  six: [
    // Tight clean /s/ -> bright /ɪ/ -> crisp /ks/ release
    { f1: 400, f2: 1900, f3: 2800, durSec: 0.038, pitchMul: 1.02, voiced: 0, noiseGain: 0.42, noiseFreq: 4800, noiseQ: 2.2, amp: 0.95 },
    { f1: 405, f2: 1960, f3: 2620, durSec: 0.076, pitchMul: 1.05, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 400, f2: 1850, f3: 2700, durSec: 0.032, pitchMul: 0.98, voiced: 0, noiseGain: 0.34, noiseFreq: 4500, noiseQ: 2.0, amp: 0.88 },
  ],
  seven: [
    // Clean /s/ -> /ɛ/ -> voiced /v/ -> /ən/
    { f1: 420, f2: 1850, f3: 2700, durSec: 0.034, pitchMul: 1.02, voiced: 0, noiseGain: 0.38, noiseFreq: 4700, noiseQ: 2.2, amp: 0.92 },
    { f1: 560, f2: 1780, f3: 2520, durSec: 0.074, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 360, f2: 1420, f3: 2380, durSec: 0.022, pitchMul: 0.98, voiced: 0.88, noiseGain: 0.08, noiseFreq: 2200, noiseQ: 1.1, amp: 0.8 },
    { f1: 460, f2: 1380, f3: 2350, durSec: 0.044, pitchMul: 0.95, voiced: 1, breath: 0.03, amp: 0.78 },
  ],
  eight: [
    // Bright /eɪ/ glide -> tight stop + crisp /t/ release
    { f1: 500, f2: 1980, f3: 2620, durSec: 0.074, pitchMul: 1.05, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 330, f2: 2240, f3: 2860, durSec: 0.044, pitchMul: 1.02, voiced: 1, breath: 0.03, amp: 0.88 },
    { f1: 380, f2: 1850, f3: 2800, durSec: 0.010, pitchMul: 1.0, voiced: 0, noiseGain: 0.02, noiseFreq: 3500, noiseQ: 1.4, amp: 0.1 },
    { f1: 440, f2: 1900, f3: 2850, durSec: 0.022, pitchMul: 1.0, voiced: 0, noiseGain: 0.38, noiseFreq: 3900, noiseQ: 1.7, amp: 0.92 },
  ],
  nine: [
    { f1: 300, f2: 1520, f3: 2420, durSec: 0.032, pitchMul: 0.96, voiced: 1, breath: 0.03, amp: 0.85 },
    { f1: 720, f2: 1120, f3: 2460, durSec: 0.076, pitchMul: 1.06, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 390, f2: 1960, f3: 2620, durSec: 0.048, pitchMul: 0.96, voiced: 1, breath: 0.03, amp: 0.8 },
  ],
  ten: [
    { f1: 440, f2: 1880, f3: 2800, durSec: 0.022, pitchMul: 1.05, voiced: 0.05, noiseGain: 0.4, noiseFreq: 3900, noiseQ: 1.6, amp: 0.98 },
    { f1: 560, f2: 1780, f3: 2520, durSec: 0.086, pitchMul: 1.04, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 300, f2: 1480, f3: 2420, durSec: 0.042, pitchMul: 0.95, voiced: 1, breath: 0.02, amp: 0.76 },
  ],
  eleven: [
    { f1: 390, f2: 1920, f3: 2580, durSec: 0.04, pitchMul: 0.97, voiced: 1, breath: 0.04, amp: 0.88 },
    { f1: 560, f2: 1780, f3: 2520, durSec: 0.076, pitchMul: 1.06, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 460, f2: 1360, f3: 2360, durSec: 0.046, pitchMul: 0.95, voiced: 1, breath: 0.03, amp: 0.8 },
  ],
  twelve: [
    { f1: 440, f2: 1880, f3: 2800, durSec: 0.022, pitchMul: 1.04, voiced: 0.05, noiseGain: 0.36, noiseFreq: 3800, noiseQ: 1.6, amp: 0.95 },
    { f1: 320, f2: 880, f3: 2260, durSec: 0.036, pitchMul: 1.0, voiced: 1, breath: 0.04, amp: 0.92 },
    { f1: 560, f2: 1760, f3: 2500, durSec: 0.092, pitchMul: 1.04, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  thirteen: [
    { f1: 420, f2: 1650, f3: 2550, durSec: 0.026, pitchMul: 1.0, voiced: 0.1, noiseGain: 0.25, noiseFreq: 3100, noiseQ: 1.1, amp: 0.9 },
    { f1: 490, f2: 1350, f3: 1680, durSec: 0.062, pitchMul: 0.98, voiced: 1, breath: 0.05, amp: 0.95 },
    { f1: 285, f2: 2240, f3: 2980, durSec: 0.074, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  fourteen: [
    { f1: 460, f2: 1120, f3: 2400, durSec: 0.024, pitchMul: 1.0, voiced: 0.05, noiseGain: 0.24, noiseFreq: 2300, noiseQ: 1.0, amp: 0.9 },
    { f1: 560, f2: 860, f3: 2420, durSec: 0.062, pitchMul: 1.0, voiced: 1, breath: 0.04, amp: 0.96 },
    { f1: 285, f2: 2240, f3: 2980, durSec: 0.074, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  fifteen: [
    { f1: 460, f2: 1150, f3: 2400, durSec: 0.024, pitchMul: 1.0, voiced: 0.05, noiseGain: 0.24, noiseFreq: 2350, noiseQ: 1.0, amp: 0.9 },
    { f1: 405, f2: 1940, f3: 2580, durSec: 0.054, pitchMul: 0.98, voiced: 1, breath: 0.04, amp: 0.94 },
    { f1: 285, f2: 2240, f3: 2980, durSec: 0.074, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  sixteen: [
    { f1: 400, f2: 1900, f3: 2700, durSec: 0.030, pitchMul: 1.02, voiced: 0, noiseGain: 0.36, noiseFreq: 4600, noiseQ: 2.1, amp: 0.92 },
    { f1: 405, f2: 1940, f3: 2580, durSec: 0.052, pitchMul: 0.98, voiced: 1, breath: 0.04, amp: 0.94 },
    { f1: 285, f2: 2240, f3: 2980, durSec: 0.074, pitchMul: 1.06, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  // Crisp, light subdivision syllables (pitched higher and tighter so 1-2-3-4 remains primary)
  and: [
    { f1: 660, f2: 1750, f3: 2480, durSec: 0.046, pitchMul: 1.12, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 350, f2: 1500, f3: 2380, durSec: 0.030, pitchMul: 1.06, voiced: 1, breath: 0.03, amp: 0.72 },
  ],
  e: [
    { f1: 285, f2: 2280, f3: 3020, durSec: 0.062, pitchMul: 1.18, voiced: 1, breath: 0.05, amp: 1.0 },
  ],
  a: [
    { f1: 630, f2: 1240, f3: 2440, durSec: 0.062, pitchMul: 1.04, voiced: 1, breath: 0.05, amp: 1.0 },
  ],
  trip: [
    { f1: 440, f2: 1850, f3: 2700, durSec: 0.016, pitchMul: 1.06, voiced: 0.05, noiseGain: 0.3, noiseFreq: 3600, noiseQ: 1.5, amp: 0.92 },
    { f1: 405, f2: 1920, f3: 2560, durSec: 0.056, pitchMul: 1.08, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  let: [
    { f1: 530, f2: 1740, f3: 2480, durSec: 0.056, pitchMul: 1.04, voiced: 1, breath: 0.04, amp: 1.0 },
    { f1: 420, f2: 1850, f3: 2700, durSec: 0.014, pitchMul: 1.0, voiced: 0, noiseGain: 0.24, noiseFreq: 3700, noiseQ: 1.6, amp: 0.8 },
  ],
  ta: [
    { f1: 440, f2: 1820, f3: 2700, durSec: 0.014, pitchMul: 1.06, voiced: 0.05, noiseGain: 0.28, noiseFreq: 3600, noiseQ: 1.5, amp: 0.92 },
    { f1: 580, f2: 1280, f3: 2420, durSec: 0.052, pitchMul: 1.08, voiced: 1, breath: 0.04, amp: 1.0 },
  ],
  la: [{ f1: 580, f2: 1240, f3: 2420, durSec: 0.06, pitchMul: 1.1, voiced: 1, breath: 0.04, amp: 1.0 }],
  li: [{ f1: 300, f2: 2180, f3: 2880, durSec: 0.06, pitchMul: 1.14, voiced: 1, breath: 0.04, amp: 1.0 }],
  go: [
    { f1: 320, f2: 1360, f3: 2320, durSec: 0.022, pitchMul: 1.02, voiced: 1, breath: 0.04, amp: 0.9 },
    { f1: 510, f2: 910, f3: 2380, durSec: 0.078, pitchMul: 1.12, voiced: 1, breath: 0.05, amp: 1.0 },
    { f1: 360, f2: 760, f3: 2260, durSec: 0.065, pitchMul: 1.05, voiced: 1, breath: 0.03, amp: 0.82 },
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

/**
 * AudioVocalizer synthesizes and schedules sample-accurate, IEM-safe vocal count
 * cues ('1', '2', '3', '4', ...) directly on a Web Audio API AudioContext timeline.
 *
 * Uses a natural Rosenberg glottal pulse + cascade formant vocal tract + shaped consonant
 * articulation and vocal presence EQ (~2.6kHz) so every beat & subdivision is warm,
 * studio-polished, intelligible, and completely free of inter-beat buzz.
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
    // Slightly tighten vocal speed at high tempos or dense 1/16 subdivisions so full word finishes cleanly
    const tempoFitBoost =
      buffer.duration > slotSec * 0.85
        ? Math.min(1.24, Math.max(1.0, buffer.duration / (slotSec * 0.88)))
        : 1.0;

    const baseRate = pitchBoost ?? (isAccent ? 1.045 : isSubdivision ? 1.02 : 1.0);
    const rate = baseRate * tempoFitBoost;
    source.playbackRate.setValueAtTime(rate, when);

    const effectiveBufferDur = buffer.duration / rate;
    const capRatio = subDiv > 1 ? 0.93 : isSubdivision ? 0.54 : 0.86;
    const maxPlaySec = Math.max(0.045, Math.min(effectiveBufferDur, slotSec * capRatio));

    const gainNode = ctx.createGain();
    const scale = isSubdivision ? 0.64 : isAccent ? 1.04 : 0.96;
    const level = Math.min(0.92, Math.max(0.0001, volume * scale));
    const fadeInEnd = when + Math.min(0.007, maxPlaySec * 0.18);
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
    // 14ms pure zero silence padding so tail never clips
    const padSamples = Math.floor(sr * 0.014);
    const totalSamples = activeSamples + padSamples;
    const buffer = ctx.createBuffer(1, totalSamples, sr);
    const out = buffer.getChannelData(0);

    // Warm human fundamental: Natural (~136 Hz rehearsal baritone) vs Studio (~154 Hz stage cut)
    const basePitchHz = isNatural ? 136 : 154;
    let phase = 0;
    let prevGlottal = 0;
    let cursor = 0;

    const makeState = (): BiquadState => ({ x1: 0, x2: 0, y1: 0, y2: 0 });
    const f1State = makeState();
    const f2State = makeState();
    const f3State = makeState();
    const f4State = makeState();
    const chestState = makeState();
    const presenceState = makeState();
    const consonantHp = makeState();
    const consonantBp = makeState();
    const hpState = makeState();
    const lpState = makeState();

    // 1-pole glottal spectral tilt state (-6dB/oct vocal fold warmth)
    const glottalTiltCutoff = isNatural ? 880 : 1160;
    const tiltCoeff = Math.exp((-2 * Math.PI * glottalTiltCutoff) / sr);
    let tiltY = 0;

    // Normalized bandpass resonator (0dB peak gain at resonance center)
    const stepResonator = (state: BiquadState, x: number, freq: number, bwHz: number): number => {
      const clampedFreq = Math.min(sr * 0.43, Math.max(90, freq));
      const q = Math.max(1.3, clampedFreq / Math.max(40, bwHz));
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

    // Peaking EQ filter for chest warmth (~205Hz) & speech presence (~2.6kHz)
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

    // Softened Rosenberg glottal pulse (0 <= p < 1) for rounder, less buzzy vocal fold closure
    const sampleRosenbergGlottal = (p: number): number => {
      const openPhase = isNatural ? 0.48 : 0.45;
      const closePhase = isNatural ? 0.21 : 0.19;
      if (p < openPhase) {
        return 0.5 * (1 - Math.cos((Math.PI * p) / openPhase));
      }
      if (p < openPhase + closePhase) {
        return Math.cos((Math.PI * 0.5 * (p - openPhase)) / closePhase);
      }
      return 0;
    };

    const bw1 = isNatural ? 92 : 84;
    const bw2 = isNatural ? 136 : 122;
    const bw3 = isNatural ? 195 : 175;
    const bw4 = isNatural ? 275 : 245;
    const chestGainDb = isNatural ? 2.6 : 1.4;
    const presenceFreq = isNatural ? 2550 : 2750;
    const presenceGainDb = isNatural ? 2.2 : 3.6;
    const outputLowpassHz = isNatural ? 5400 : 6400;

    let pinkNoise = 0;

    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
      const frame = frames[fIdx];
      const next = frames[fIdx + 1] ?? frame;
      const count =
        fIdx === frames.length - 1
          ? Math.max(1, activeSamples - cursor)
          : Math.max(1, Math.floor(frame.durSec * sr));

      const startVoiced = frame.voiced ?? 1;
      const endVoiced = next.voiced ?? startVoiced;
      const startPitch = frame.pitchMul ?? 1.0;
      const endPitch = next.pitchMul ?? startPitch;
      const startBreath = frame.breath ?? 0.04;
      const endBreath = next.breath ?? startBreath;
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
        const s = rawT * rawT * (3 - 2 * rawT);

        const f1 = frame.f1 + (next.f1 - frame.f1) * s;
        const f2 = frame.f2 + (next.f2 - frame.f2) * s;
        const f3 = frame.f3 + (next.f3 - frame.f3) * s;
        const f4 = Math.min(3900, Math.max(3150, (isNatural ? 3420 : 3560) + (f3 - 2400) * 0.25));
        const pitchMul = startPitch + (endPitch - startPitch) * s;
        const voicedMix = startVoiced + (endVoiced - startVoiced) * s;
        const breathMix = startBreath + (endBreath - startBreath) * s;
        const noiseAmp = startNoise + (endNoise - startNoise) * s;
        const noiseFreq = startNoiseFreq + (endNoiseFreq - startNoiseFreq) * s;
        const noiseQ = startNoiseQ + (endNoiseQ - startNoiseQ) * s;
        const frameAmp = startAmp + (endAmp - startAmp) * s;

        // Expressive human prosody arc + subtle 0.28% organic micro-drift
        const progress = cursor / activeSamples;
        const prosodyArc = isNatural
          ? 0.99 + Math.sin(progress * Math.PI) * 0.048 - progress * 0.055
          : 1.01 + Math.sin(progress * Math.PI) * 0.032 - progress * 0.04;
        const microDrift = 1 + Math.sin((cursor / sr) * 29.0) * 0.0028;

        let glottalSource = 0;
        if (voicedMix > 0.001) {
          const pitch = basePitchHz * pitchMul * prosodyArc * microDrift;
          phase += pitch / sr;
          if (phase >= 1) phase -= 1;

          // 2x oversampled glottal pulse differentiation + natural glottal spectral tilt
          const gA = sampleRosenbergGlottal(phase);
          const pMid = (phase + (0.5 * pitch) / sr) % 1;
          const gB = sampleRosenbergGlottal(pMid);
          const diffA = gB - prevGlottal;
          const diffB = gA - gB;
          prevGlottal = gA;
          const rawPulse = (diffA + diffB) * 3.8;

          tiltY = (1 - tiltCoeff) * rawPulse + tiltCoeff * tiltY;

          // Natural aspiration breath modulated by open glottis phase
          const breathLevel = breathMix * (isNatural ? 1.15 : 0.85);
          const breathNoise = (Math.random() * 2 - 1) * breathLevel * (0.65 + gA * 0.65);
          glottalSource = (tiltY + breathNoise) * voicedMix;
        }

        // 4-formant cascade + weighted parallel sum eliminates metallic hollow dips
        const v1 = stepResonator(f1State, glottalSource, f1, bw1);
        const v2 = stepResonator(f2State, v1 * 0.72 + glottalSource * 0.34, f2, bw2);
        const v3 = stepResonator(f3State, v2 * 0.58 + glottalSource * 0.16, f3, bw3);
        const v4 = stepResonator(f4State, v3 * 0.45 + glottalSource * 0.08, f4, bw4);
        const vowelOut = v1 * 0.96 + v2 * 0.82 + v3 * 0.42 + v4 * 0.22;

        // Clean consonant air shaping: high-passed white noise for crisp 's'/'t'/'th', warm pink air for 'f'/'v'
        const w = Math.random() * 2 - 1;
        pinkNoise = pinkNoise * 0.38 + w * 0.62;
        const brightAir = stepHighpass(consonantHp, w, 1500);
        const exciterNoise = noiseFreq >= 2900 ? brightAir : pinkNoise;
        const bwConsonant = Math.max(240, noiseFreq / Math.max(0.85, noiseQ));
        const consonantScale = isNatural ? 0.86 : 1.0;
        const consonantOut =
          stepResonator(consonantBp, exciterNoise, noiseFreq, bwConsonant) * noiseAmp * consonantScale;

        let sample = (vowelOut + consonantOut) * frameAmp;

        // Warm chest body + calibrated vocal presence EQ
        sample = stepPeaking(chestState, sample, 205, 0.85, chestGainDb);
        sample = stepPeaking(presenceState, sample, presenceFreq, 0.95, presenceGainDb);
        // Clean sub-105Hz rumble while keeping natural vocal fundamental warmth
        sample = stepHighpass(hpState, sample, 105);
        sample = stepLowpass(lpState, sample, outputLowpassHz);

        // Gentle analog tape warmth soft-saturation
        sample = Math.tanh(sample * 1.15) / 1.15;

        // Smooth cosine fade-in (7ms) and fade-out (24ms) to pure silence
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

    // Soft-knee RMS + peak normalization so all numbers ('one'..'eight') match perceived loudness
    let sumSq = 0;
    let maxAbs = 0;
    for (let i = 0; i < activeSamples; i++) {
      const s = out[i];
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > maxAbs) maxAbs = a;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, activeSamples));
    if (rms > 0.001 && maxAbs > 0.001) {
      const targetGain = Math.min(0.85 / maxAbs, 0.23 / rms);
      for (let i = 0; i < activeSamples; i++) {
        out[i] *= targetGain;
      }
    }

    return buffer;
  }
}

export const sharedAudioVocalizer = new AudioVocalizer();
