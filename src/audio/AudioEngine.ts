import { SUBDIVISIONS } from '../constants/metronomeData';
import {
  BeatAccentType,
  ClickProfile,
  ClickSoundId,
  MetronomeSessionState,
} from '../types/metronome';
import { getSubdivisionsPerBeat } from '../utils/timeline';
import { sharedAudioVocalizer } from './AudioVocalizer';

const WORKLET_CODE = `
class MetronomeClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._samplesSinceTick = 0;
    this._active = false;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.active === 'boolean') {
        this._active = e.data.active;
        this._samplesSinceTick = 0;
      }
    };
  }
  process(inputs, outputs) {
    if (this._active) {
      const blockSize = outputs[0]?.[0]?.length || 128;
      this._samplesSinceTick += blockSize;
      // Notify roughly every ~21-23ms on the Web Audio rendering thread
      if (this._samplesSinceTick >= 1024) {
        this._samplesSinceTick = 0;
        this.port.postMessage('tick');
      }
    }
    return true;
  }
}
registerProcessor('metronome-clock-processor', MetronomeClockProcessor);
`;

const WORKER_CODE = `
let running = false;
function pump() {
  if (!running) return;
  postMessage('tick');
  setTimeout(pump, 25);
}
onmessage = (e) => {
  if (e.data === 'start' && !running) {
    running = true;
    pump();
  } else if (e.data === 'stop') {
    running = false;
  }
};
`;

/**
 * Dedicated sample-accurate Web Audio API engine driven strictly by
 * AudioContext.currentTime and an AudioWorklet (with Web Worker fallback).
 * Completely decoupled from React/UI rendering cycles to prevent timing drift.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private workletInitPromise: Promise<void> | null = null;
  private fallbackWorker: Worker | null = null;
  private clockActive = false;

  private session: MetronomeSessionState | null = null;
  private serverOffsetMs = 0;
  private deviceOffsetMs = 0;
  private anchorCtxTime = 0;
  private lastScheduledStepIndex = -1;
  private lastSequenceId = -1;
  private lastBpm = 0;
  private lastSubdivision = '';
  private localMuted = false;

  // 240ms lookahead window on the hardware AudioContext timeline
  private readonly scheduleAheadSec = 0.24;

  public isSuspended(): boolean {
    return !this.ctx || this.ctx.state === 'suspended';
  }

  public async unlockAudio(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    this.scheduleAhead();
    return ctx.state === 'running';
  }

  public setDeviceOffsetMs(offsetMs: number): void {
    const clamped = Math.max(-100, Math.min(100, Math.round(offsetMs)));
    if (clamped === this.deviceOffsetMs) return;
    const deltaSec = (clamped - this.deviceOffsetMs) / 1000;
    this.deviceOffsetMs = clamped;
    if (this.session?.playback.isPlaying && this.ctx) {
      this.anchorCtxTime += deltaSec;
    }
  }

  public getDeviceOffsetMs(): number {
    return this.deviceOffsetMs;
  }

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      sharedAudioVocalizer.preloadStandardCounts(this.ctx);
      this.initAudioClockPump(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getContextTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private initAudioClockPump(ctx: AudioContext): void {
    if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet && !this.workletInitPromise) {
      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.workletInitPromise = ctx.audioWorklet
        .addModule(url)
        .then(() => {
          URL.revokeObjectURL(url);
          if (!this.ctx || this.ctx !== ctx) return;
          const node = new AudioWorkletNode(ctx, 'metronome-clock-processor');
          // Connect silently so the Web Audio rendering thread continuously processes blocks
          const silentGain = ctx.createGain();
          silentGain.gain.value = 0;
          node.connect(silentGain);
          silentGain.connect(ctx.destination);
          node.port.onmessage = () => this.scheduleAhead();
          this.workletNode = node;
          this.workletReady = true;
          if (this.clockActive) {
            node.port.postMessage({ active: true });
            this.stopWorkerFallback();
          }
        })
        .catch(() => {
          URL.revokeObjectURL(url);
          this.workletReady = false;
        });
    }
  }

  private startWorkerFallback(): void {
    if (this.fallbackWorker || typeof Worker === 'undefined') return;
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    this.fallbackWorker = new Worker(url);
    URL.revokeObjectURL(url);
    this.fallbackWorker.onmessage = () => this.scheduleAhead();
    this.fallbackWorker.postMessage('start');
  }

  private stopWorkerFallback(): void {
    if (this.fallbackWorker) {
      this.fallbackWorker.postMessage('stop');
      this.fallbackWorker.terminate();
      this.fallbackWorker = null;
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public setLocalMuted(muted: boolean): void {
    this.localMuted = muted;
  }

  public updateSyncState(session: MetronomeSessionState | null, serverOffsetMs: number): void {
    const effectiveOffset =
      serverOffsetMs === 0 && session && session.playback.anchorServerMs > 1_000_000_000_000
        ? Date.now() - performance.now()
        : serverOffsetMs;

    this.serverOffsetMs = effectiveOffset;
    const prevPlaying = this.session?.playback.isPlaying ?? false;
    const prevSeq = this.lastSequenceId;
    const prevBpm = this.lastBpm;
    const prevSub = this.lastSubdivision;
    this.session = session;

    if (!session || !session.playback.isPlaying) {
      this.stopClockPump();
      this.lastScheduledStepIndex = -1;
      this.lastSequenceId = session?.playback.sequenceId ?? -1;
      this.lastBpm = session?.bpm ?? 0;
      this.lastSubdivision = session?.subdivision ?? '';
      return;
    }

    const ctx = this.ensureContext();
    const seqChanged = session.playback.sequenceId !== prevSeq;
    const tempoChanged = session.bpm !== prevBpm || session.subdivision !== prevSub;

    const estimatedServerNow = performance.now() + this.serverOffsetMs;
    const targetAnchorCtxTime =
      ctx.currentTime +
      (session.playback.anchorServerMs - estimatedServerNow + this.deviceOffsetMs) / 1000;

    if (!prevPlaying || seqChanged || tempoChanged) {
      sharedAudioVocalizer.stopAll();
      this.lastSequenceId = session.playback.sequenceId;
      this.lastBpm = session.bpm;
      this.lastSubdivision = session.subdivision;
      this.anchorCtxTime = targetAnchorCtxTime;

      const subPerBeat = getSubdivisionsPerBeat(session.subdivision);
      const dtMs = estimatedServerNow - session.playback.anchorServerMs;
      const currentTotalBeats =
        session.playback.anchorTotalBeats + (dtMs / 60000) * session.bpm;
      const currentStep = Math.floor(currentTotalBeats * subPerBeat);
      this.lastScheduledStepIndex = Math.max(-1, currentStep - 1);
    } else {
      // Gentle phase slew when periodic NTP clock sync nudges offset slightly
      const driftSec = targetAnchorCtxTime - this.anchorCtxTime;
      const absDrift = Math.abs(driftSec);
      if (absDrift > 0.025) {
        this.anchorCtxTime = targetAnchorCtxTime;
      } else if (absDrift > 0.002) {
        this.anchorCtxTime += driftSec * 0.35;
      }
    }

    this.startClockPump();
  }

  private startClockPump(): void {
    this.clockActive = true;
    if (this.workletReady && this.workletNode) {
      this.workletNode.port.postMessage({ active: true });
      this.stopWorkerFallback();
    } else {
      this.startWorkerFallback();
    }
    this.scheduleAhead();
  }

  private stopClockPump(): void {
    this.clockActive = false;
    sharedAudioVocalizer.stopAll();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ active: false });
    }
    this.stopWorkerFallback();
  }

  public dispose(): void {
    this.stopClockPump();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private scheduleAhead(): void {
    if (!this.session || !this.session.playback.isPlaying || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const session = this.session;
    const subPerBeat = getSubdivisionsPerBeat(session.subdivision);
    const nowCtx = this.ctx.currentTime;
    const horizonCtx = nowCtx + this.scheduleAheadSec;

    const secSinceAnchorHorizon = horizonCtx - this.anchorCtxTime;
    const maxBeatsAtHorizon =
      session.playback.anchorTotalBeats + (secSinceAnchorHorizon / 60) * session.bpm;
    const maxStep = Math.floor(maxBeatsAtHorizon * subPerBeat);

    const minStep = Math.max(0, this.lastScheduledStepIndex + 1);

    for (let step = minStep; step <= maxStep; step++) {
      const beatFloat = step / subPerBeat;
      const beatsSinceAnchor = beatFloat - session.playback.anchorTotalBeats;
      const stepCtxTime = this.anchorCtxTime + (beatsSinceAnchor / session.bpm) * 60;
      const deltaSec = stepCtxTime - nowCtx;

      // Skip events already more than 45ms in the past
      if (deltaSec < -0.045) {
        this.lastScheduledStepIndex = step;
        continue;
      }

      const when = Math.max(nowCtx + 0.004, stepCtxTime);
      this.scheduleStepSound(session, step, subPerBeat, when);
      this.lastScheduledStepIndex = step;
    }
  }

  private scheduleStepSound(
    session: MetronomeSessionState,
    step: number,
    subPerBeat: number,
    when: number
  ): void {
    if (this.localMuted || !this.ctx) return;

    const beatsPerBar = Math.max(1, session.timeSignature.numerator);
    const countInBeatsTotal = session.countInBars * beatsPerBar;
    const beatIndexTotal = Math.floor(step / subPerBeat);
    const subIndex = step % subPerBeat;
    const isMainBeat = subIndex === 0;
    const isCountingIn = beatIndexTotal < countInBeatsTotal;

    const profile: ClickProfile = session.clickProfile;
    const masterVol = profile.masterVolume;
    if (masterVol <= 0.005) return;

    const clickEnabled = profile.clickEnabled ?? true;
    const vocalMode = profile.vocalMode ?? 'beats';
    const vocalVolume = (profile.vocalVolume ?? 0.9) * masterVol;

    if (isMainBeat) {
      let accentType: BeatAccentType = 'normal';
      let beatInBar = 0;

      if (isCountingIn) {
        beatInBar = beatIndexTotal % beatsPerBar;
        accentType = beatInBar === 0 ? 'accent' : 'normal';
      } else {
        const songBeatIndex = beatIndexTotal - countInBeatsTotal;
        beatInBar = songBeatIndex % beatsPerBar;
        accentType = session.accentPattern[beatInBar] ?? (beatInBar === 0 ? 'accent' : 'normal');
      }

      const isAccent = accentType === 'accent';

      if (clickEnabled && accentType !== 'mute') {
        const soundId = isAccent ? profile.accentSound : profile.normalSound;
        const vol = (isAccent ? profile.accentVolume : profile.normalVolume) * masterVol;
        if (vol > 0.005) {
          this.triggerSound(soundId, when, vol, isAccent);
        }
      }

      if (vocalMode === 'bar_countdown') {
        if (beatInBar === 0 && vocalVolume > 0.005) {
          sharedAudioVocalizer.scheduleBarCountdown(this.ctx, beatsPerBar, when, {
            volume: vocalVolume,
            bpm: session.bpm,
            isAccent: true,
            isSubdivision: false,
          });
        }
      } else if (accentType !== 'mute') {
        const shouldVocalize =
          vocalMode === 'beats' ||
          vocalMode === 'beats_and_sub' ||
          (vocalMode === 'countin_only' && isCountingIn);

        if (shouldVocalize && vocalVolume > 0.005) {
          sharedAudioVocalizer.scheduleBeatCount(this.ctx, beatInBar + 1, when, {
            volume: vocalVolume,
            bpm: session.bpm,
            isAccent,
            isSubdivision: false,
          });
        }
      }
    } else {
      if (clickEnabled) {
        const vol = profile.subdivisionVolume * masterVol;
        if (vol > 0.005) {
          this.triggerSound(profile.subdivisionSound, when, vol * 0.72, false, true);
        }
      }

      if (vocalMode === 'beats_and_sub' && vocalVolume > 0.005) {
        const subMeta = SUBDIVISIONS.find((s) => s.id === session.subdivision);
        const syllable = subMeta?.syllables[subIndex] ?? 'and';
        const token = syllable === '&' ? 'and' : syllable;
        sharedAudioVocalizer.scheduleToken(this.ctx, token, when, {
          volume: vocalVolume * 0.78,
          bpm: session.bpm,
          isAccent: false,
          isSubdivision: true,
        });
      }
    }
  }

  public previewSound(soundId: ClickSoundId, isAccent = false, volume = 0.85): void {
    const ctx = this.ensureContext();
    this.triggerSound(soundId, ctx.currentTime + 0.01, volume, isAccent);
  }

  public previewVocalCount(volume = 0.9): void {
    const ctx = this.ensureContext();
    sharedAudioVocalizer.previewBarCount(ctx, volume, this.session?.bpm ?? 120);
  }

  private triggerSound(
    soundId: ClickSoundId,
    when: number,
    volume: number,
    isAccent: boolean,
    isSubdivision = false
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const pitchBoost = isAccent ? 1.24 : isSubdivision ? 0.86 : 1.0;

    switch (soundId) {
      case 'digital': {
        this.playTone(ctx, when, 'sine', 1320 * pitchBoost, 880 * pitchBoost, 0.032, volume);
        break;
      }
      case 'sharp': {
        this.playTone(ctx, when, 'triangle', 2200 * pitchBoost, 1100 * pitchBoost, 0.025, volume * 0.9);
        this.playFilteredNoise(ctx, when, 'highpass', 3200, 0.018, volume * 0.45);
        break;
      }
      case 'soft': {
        this.playTone(ctx, when, 'sine', 680 * pitchBoost, 520 * pitchBoost, 0.045, volume * 0.85);
        break;
      }
      case 'woodblock': {
        const base = 760 * pitchBoost;
        this.playTone(ctx, when, 'sine', base * 1.12, base, 0.052, volume);
        this.playTone(ctx, when, 'triangle', base * 2.15, base * 1.9, 0.024, volume * 0.35);
        break;
      }
      case 'clave': {
        const base = 1850 * pitchBoost;
        this.playTone(ctx, when, 'sine', base * 1.05, base, 0.038, volume);
        this.playTone(ctx, when, 'sine', base * 1.52, base * 1.48, 0.025, volume * 0.4);
        break;
      }
      case 'rim': {
        this.playTone(ctx, when, 'triangle', 480 * pitchBoost, 220 * pitchBoost, 0.035, volume * 0.8);
        this.playFilteredNoise(ctx, when, 'bandpass', 2800 * pitchBoost, 0.032, volume * 0.9);
        break;
      }
      case 'stick': {
        this.playTone(ctx, when, 'triangle', 1420 * pitchBoost, 820 * pitchBoost, 0.024, volume * 0.7);
        this.playFilteredNoise(ctx, when, 'bandpass', 2400, 0.022, volume * 0.75);
        break;
      }
      case 'cowbell': {
        const f1 = 540 * pitchBoost;
        const f2 = 810 * pitchBoost;
        this.playTone(ctx, when, 'square', f1, f1 * 0.98, 0.08, volume * 0.35, 1800);
        this.playTone(ctx, when, 'square', f2, f2 * 0.98, 0.075, volume * 0.3, 1800);
        break;
      }
      case 'studio': {
        this.playTone(ctx, when, 'sine', 1560 * pitchBoost, 1180 * pitchBoost, 0.028, volume * 0.95);
        this.playFilteredNoise(ctx, when, 'highpass', 4200, 0.012, volume * 0.3);
        break;
      }
      case 'pulse': {
        this.playTone(ctx, when, 'square', 980 * pitchBoost, 480 * pitchBoost, 0.022, volume * 0.45, 2600);
        break;
      }
      case 'synth': {
        this.playTone(ctx, when, 'sine', 1046.5 * pitchBoost, 1046.5 * pitchBoost, 0.058, volume * 0.85);
        this.playTone(ctx, when, 'sine', 2093 * pitchBoost, 1568 * pitchBoost, 0.03, volume * 0.25);
        break;
      }
      case 'etick': {
        this.playTone(ctx, when, 'sine', 2900 * pitchBoost, 1400 * pitchBoost, 0.014, volume * 0.9);
        break;
      }
      case 'warm': {
        this.playTone(ctx, when, 'sine', 620 * pitchBoost, 440 * pitchBoost, 0.055, volume * 0.95);
        this.playTone(ctx, when, 'triangle', 930 * pitchBoost, 660 * pitchBoost, 0.028, volume * 0.22);
        break;
      }
      case 'tight': {
        this.playTone(ctx, when, 'triangle', 1240 * pitchBoost, 620 * pitchBoost, 0.022, volume * 0.9);
        this.playFilteredNoise(ctx, when, 'bandpass', 3600, 0.015, volume * 0.5);
        break;
      }
      case 'stage': {
        this.playTone(ctx, when, 'sawtooth', 1480 * pitchBoost, 980 * pitchBoost, 0.032, volume * 0.5, 3200);
        this.playFilteredNoise(ctx, when, 'highpass', 2600, 0.02, volume * 0.55);
        break;
      }
    }
  }

  private playTone(
    ctx: AudioContext,
    when: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number,
    lowpassHz?: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, startFreq), when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), when + duration);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(Math.min(1, volume), when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    if (lowpassHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowpassHz, when);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.01);
  }

  private playFilteredNoise(
    ctx: AudioContext,
    when: number,
    filterType: BiquadFilterType,
    freq: number,
    duration: number,
    volume: number
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, when);
    filter.Q.setValueAtTime(filterType === 'bandpass' ? 3.2 : 1.0, when);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(Math.min(1, volume), when + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(when);
    src.stop(when + duration + 0.01);
  }
}

export const audioEngine = new AudioEngine();
