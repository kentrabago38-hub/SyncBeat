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
  voiced?: boolean;
  noiseGain?: number;
}

const VOCAL_RECIPES: Record<string, FormantFrame[]> = {
  one: [
    { f1: 310, f2: 720, f3: 2300, durSec: 0.045, pitchMul: 1.0, voiced: true },
    { f1: 640, f2: 1180, f3: 2420, durSec: 0.08, pitchMul: 1.06, voiced: true },
    { f1: 290, f2: 1480, f3: 2450, durSec: 0.045, pitchMul: 0.96, voiced: true },
  ],
  two: [
    { f1: 450, f2: 1800, f3: 2700, durSec: 0.025, voiced: false, noiseGain: 0.58 },
    { f1: 310, f2: 870, f3: 2240, durSec: 0.13, pitchMul: 1.04, voiced: true },
  ],
  three: [
    { f1: 420, f2: 1650, f3: 2550, durSec: 0.032, voiced: false, noiseGain: 0.36 },
    { f1: 350, f2: 1280, f3: 1760, durSec: 0.035, pitchMul: 0.98, voiced: true },
    { f1: 280, f2: 2260, f3: 2980, durSec: 0.095, pitchMul: 1.05, voiced: true },
  ],
  four: [
    { f1: 480, f2: 1100, f3: 2400, durSec: 0.036, voiced: false, noiseGain: 0.34 },
    { f1: 570, f2: 840, f3: 2410, durSec: 0.092, pitchMul: 1.04, voiced: true },
    { f1: 460, f2: 1240, f3: 1750, durSec: 0.045, pitchMul: 0.95, voiced: true },
  ],
  five: [
    { f1: 480, f2: 1150, f3: 2400, durSec: 0.035, voiced: false, noiseGain: 0.34 },
    { f1: 730, f2: 1100, f3: 2440, durSec: 0.075, pitchMul: 1.04, voiced: true },
    { f1: 390, f2: 2020, f3: 2640, durSec: 0.055, pitchMul: 0.98, voiced: true },
  ],
  six: [
    { f1: 400, f2: 1900, f3: 2600, durSec: 0.045, voiced: false, noiseGain: 0.52 },
    { f1: 400, f2: 1920, f3: 2560, durSec: 0.075, pitchMul: 1.04, voiced: true },
    { f1: 400, f2: 1850, f3: 2600, durSec: 0.038, voiced: false, noiseGain: 0.45 },
  ],
  seven: [
    { f1: 420, f2: 1850, f3: 2550, durSec: 0.04, voiced: false, noiseGain: 0.46 },
    { f1: 550, f2: 1770, f3: 2490, durSec: 0.075, pitchMul: 1.06, voiced: true },
    { f1: 490, f2: 1350, f3: 2350, durSec: 0.055, pitchMul: 0.95, voiced: true },
  ],
  eight: [
    { f1: 490, f2: 2040, f3: 2640, durSec: 0.075, pitchMul: 1.05, voiced: true },
    { f1: 340, f2: 2220, f3: 2820, durSec: 0.045, pitchMul: 1.02, voiced: true },
    { f1: 450, f2: 1800, f3: 2700, durSec: 0.022, voiced: false, noiseGain: 0.46 },
  ],
  nine: [
    { f1: 280, f2: 1520, f3: 2420, durSec: 0.032, pitchMul: 0.96, voiced: true },
    { f1: 720, f2: 1140, f3: 2450, durSec: 0.075, pitchMul: 1.05, voiced: true },
    { f1: 410, f2: 1960, f3: 2600, durSec: 0.05, pitchMul: 0.96, voiced: true },
  ],
  ten: [
    { f1: 450, f2: 1800, f3: 2700, durSec: 0.024, voiced: false, noiseGain: 0.56 },
    { f1: 550, f2: 1770, f3: 2490, durSec: 0.085, pitchMul: 1.04, voiced: true },
    { f1: 280, f2: 1500, f3: 2420, durSec: 0.04, pitchMul: 0.95, voiced: true },
  ],
  eleven: [
    { f1: 390, f2: 1920, f3: 2560, durSec: 0.04, pitchMul: 0.96, voiced: true },
    { f1: 550, f2: 1770, f3: 2490, durSec: 0.075, pitchMul: 1.06, voiced: true },
    { f1: 480, f2: 1360, f3: 2360, durSec: 0.045, pitchMul: 0.95, voiced: true },
  ],
  twelve: [
    { f1: 450, f2: 1800, f3: 2700, durSec: 0.024, voiced: false, noiseGain: 0.52 },
    { f1: 320, f2: 880, f3: 2250, durSec: 0.035, pitchMul: 1.0, voiced: true },
    { f1: 550, f2: 1760, f3: 2480, durSec: 0.095, pitchMul: 1.04, voiced: true },
  ],
  thirteen: [
    { f1: 420, f2: 1650, f3: 2550, durSec: 0.03, voiced: false, noiseGain: 0.36 },
    { f1: 490, f2: 1350, f3: 1750, durSec: 0.065, pitchMul: 0.98, voiced: true },
    { f1: 280, f2: 2260, f3: 2980, durSec: 0.075, pitchMul: 1.05, voiced: true },
  ],
  fourteen: [
    { f1: 480, f2: 1100, f3: 2400, durSec: 0.032, voiced: false, noiseGain: 0.32 },
    { f1: 570, f2: 840, f3: 2410, durSec: 0.065, pitchMul: 1.0, voiced: true },
    { f1: 280, f2: 2260, f3: 2980, durSec: 0.075, pitchMul: 1.06, voiced: true },
  ],
  fifteen: [
    { f1: 480, f2: 1150, f3: 2400, durSec: 0.03, voiced: false, noiseGain: 0.32 },
    { f1: 400, f2: 1920, f3: 2560, durSec: 0.055, pitchMul: 0.98, voiced: true },
    { f1: 280, f2: 2260, f3: 2980, durSec: 0.075, pitchMul: 1.06, voiced: true },
  ],
  sixteen: [
    { f1: 400, f2: 1900, f3: 2600, durSec: 0.035, voiced: false, noiseGain: 0.45 },
    { f1: 400, f2: 1920, f3: 2560, durSec: 0.05, pitchMul: 0.98, voiced: true },
    { f1: 280, f2: 2260, f3: 2980, durSec: 0.075, pitchMul: 1.06, voiced: true },
  ],
  and: [{ f1: 660, f2: 1720, f3: 2410, durSec: 0.085, pitchMul: 0.94, voiced: true }],
  e: [{ f1: 280, f2: 2250, f3: 2950, durSec: 0.075, pitchMul: 0.96, voiced: true }],
  a: [{ f1: 540, f2: 1320, f3: 2400, durSec: 0.075, pitchMul: 0.92, voiced: true }],
  trip: [
    { f1: 450, f2: 1800, f3: 2700, durSec: 0.02, voiced: false, noiseGain: 0.45 },
    { f1: 400, f2: 1920, f3: 2560, durSec: 0.065, pitchMul: 0.96, voiced: true },
  ],
  let: [{ f1: 540, f2: 1760, f3: 2480, durSec: 0.075, pitchMul: 0.94, voiced: true }],
  go: [
    { f1: 320, f2: 1350, f3: 2300, durSec: 0.022, pitchMul: 1.02, voiced: true },
    { f1: 500, f2: 900, f3: 2350, durSec: 0.075, pitchMul: 1.12, voiced: true },
    { f1: 360, f2: 760, f3: 2250, durSec: 0.065, pitchMul: 1.05, voiced: true },
  ],
};

export interface ScheduleVocalOptions {
  volume: number;
  bpm: number;
  isAccent?: boolean;
  isSubdivision?: boolean;
  pitchBoost?: number;
}

/**
 * AudioVocalizer synthesizes and schedules sample-accurate vocal count numbers
 * ('1', '2', '3', '4', ...) directly on a Web Audio API AudioContext timeline.
 */
export class AudioVocalizer {
  private bufferCache = new Map<string, AudioBuffer>();
  private activeSources = new Set<AudioBufferSourceNode>();
  private cachedSampleRate = 0;

  public getBeatToken(beatNumberOneBased: number): string {
    return NUMBER_TOKENS[beatNumberOneBased] ?? 'one';
  }

  public stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeSources.clear();
  }

  public preloadStandardCounts(ctx: AudioContext): void {
    for (const num of [1, 2, 3, 4, 5, 6, 7, 8]) {
      this.getOrCreateBuffer(ctx, this.getBeatToken(num));
    }
    this.getOrCreateBuffer(ctx, 'and');
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
    const { volume, bpm, isAccent = false, isSubdivision = false, pitchBoost } = options;
    if (volume <= 0.005) return;

    const buffer = this.getOrCreateBuffer(ctx, token);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const rate =
      pitchBoost ?? (isAccent ? 1.09 : isSubdivision ? 0.94 : 1.0);
    source.playbackRate.setValueAtTime(rate, when);

    const maxPlaySec = Math.max(
      0.085,
      Math.min(buffer.duration, (60 / bpm) * (isSubdivision ? 0.45 : 0.88))
    );

    const gainNode = ctx.createGain();
    const level = Math.min(1, Math.max(0.0001, volume));
    gainNode.gain.setValueAtTime(0.0001, when);
    gainNode.gain.linearRampToValueAtTime(level, when + 0.005);
    gainNode.gain.setValueAtTime(level, when + Math.max(0.02, maxPlaySec - 0.025));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + maxPlaySec);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    source.start(when);
    source.stop(when + maxPlaySec + 0.01);
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

  public previewBarCount(ctx: AudioContext, volume = 0.9, bpm = 120): void {
    this.stopAll();
    this.preloadStandardCounts(ctx);
    this.scheduleBarCountdown(ctx, 4, ctx.currentTime + 0.02, {
      volume,
      bpm,
    });
  }

  private getOrCreateBuffer(ctx: AudioContext, token: string): AudioBuffer {
    if (this.cachedSampleRate !== ctx.sampleRate) {
      this.bufferCache.clear();
      this.cachedSampleRate = ctx.sampleRate;
    }

    const key = token.toLowerCase();
    const existing = this.bufferCache.get(key);
    if (existing) return existing;

    const frames = VOCAL_RECIPES[key] ?? VOCAL_RECIPES.one;
    const buffer = this.renderFormantBuffer(ctx, frames);
    this.bufferCache.set(key, buffer);
    return buffer;
  }

  private renderFormantBuffer(ctx: AudioContext, frames: FormantFrame[]): AudioBuffer {
    const sr = ctx.sampleRate;
    const totalDur = frames.reduce((acc, f) => acc + f.durSec, 0);
    const totalSamples = Math.max(1, Math.floor(sr * totalDur));
    const buffer = ctx.createBuffer(1, totalSamples, sr);
    const out = buffer.getChannelData(0);

    const basePitchHz = 148;
    let phase = 0;
    let cursor = 0;

    const makeState = () => ({ x1: 0, x2: 0, y1: 0, y2: 0 });
    const r1 = makeState();
    const r2 = makeState();
    const r3 = makeState();

    const stepBiquad = (
      state: { x1: number; x2: number; y1: number; y2: number },
      x: number,
      freq: number,
      bw: number
    ) => {
      const clampedFreq = Math.min(sr * 0.45, Math.max(60, freq));
      const w0 = (2 * Math.PI * clampedFreq) / sr;
      const sinW0 = Math.sin(w0);
      const alpha = sinW0 * Math.sinh((Math.LN2 / 2) * (bw / clampedFreq) * (w0 / sinW0));
      const a0 = 1 + alpha;
      const y =
        (alpha * x - alpha * state.x2 - -2 * Math.cos(w0) * state.y1 - (1 - alpha) * state.y2) /
        a0;
      state.x2 = state.x1;
      state.x1 = x;
      state.y2 = state.y1;
      state.y1 = y;
      return y;
    };

    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
      const frame = frames[fIdx];
      const next = frames[fIdx + 1] ?? frame;
      const count = Math.floor(frame.durSec * sr);

      for (let i = 0; i < count && cursor < totalSamples; i++) {
        const t = i / Math.max(1, count);
        const f1 = frame.f1 + (next.f1 - frame.f1) * t * 0.45;
        const f2 = frame.f2 + (next.f2 - frame.f2) * t * 0.45;
        const f3 = frame.f3 + (next.f3 - frame.f3) * t * 0.45;

        let source = 0;
        if (frame.voiced !== false) {
          const pitch = basePitchHz * (frame.pitchMul ?? 1.0);
          phase += pitch / sr;
          if (phase >= 1) phase -= 1;
          const glottal =
            phase < 0.45
              ? Math.sin((phase / 0.45) * Math.PI)
              : -0.18 * Math.sin(((phase - 0.45) / 0.55) * Math.PI);
          source += glottal * 0.85;
        }

        const noise = (Math.random() * 2 - 1) * (frame.noiseGain ?? 0.04);
        source += noise;

        const y1 = stepBiquad(r1, source, f1, 80) * 1.45;
        const y2 = stepBiquad(r2, source, f2, 110) * 0.9;
        const y3 = stepBiquad(r3, source, f3, 160) * 0.45;

        let sample = y1 + y2 + y3;
        if (frame.voiced === false) {
          sample += noise * 0.65;
        }

        const globalPos = cursor / totalSamples;
        const attack = Math.min(1, cursor / (sr * 0.008));
        const release = Math.min(1, (totalSamples - cursor) / (sr * 0.022));
        const env = attack * release * (1 - globalPos * 0.12);

        out[cursor] = Math.tanh(sample * 1.6) * env;
        cursor++;
      }
    }

    let maxAbs = 0;
    for (let i = 0; i < totalSamples; i++) {
      const a = Math.abs(out[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs > 0.001) {
      const norm = 0.92 / maxAbs;
      for (let i = 0; i < totalSamples; i++) {
        out[i] *= norm;
      }
    }

    return buffer;
  }
}

export const sharedAudioVocalizer = new AudioVocalizer();
