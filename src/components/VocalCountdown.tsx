import { Mic, Play, Volume2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { ClickProfile, SubdivisionType, VocalCountMode } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface VocalCountdownProps {
  profile: ClickProfile;
  bpm: number;
  beatsPerBar: number;
  subdivision?: SubdivisionType;
  isHost: boolean;
  timeline?: TimelineSnapshot;
  onUpdateClickProfile: (patch: Partial<ClickProfile>) => void;
  onPreviewVocalCount: () => void;
  variant?: 'settings' | 'cue';
}

const MODE_OPTIONS: Array<{ id: VocalCountMode; label: string }> = [
  { id: 'bar_countdown', label: 'Vocal Countdown (Beat 1)' },
  { id: 'beats', label: 'Every Beat (1 2 3 4)' },
  { id: 'countin_only', label: 'Count-In Only' },
  { id: 'beats_and_sub', label: 'Beats + Subdivisions' },
  { id: 'off', label: 'Off' },
];

export const VocalCountdown: React.FC<VocalCountdownProps> = React.memo(({
  profile,
  bpm,
  beatsPerBar,
  subdivision = 'quarter',
  isHost,
  timeline,
  onUpdateClickProfile,
  onPreviewVocalCount,
  variant = 'settings',
}) => {
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const previewTimersRef = useRef<number[]>([]);

  const vocalMode = profile.vocalMode ?? 'beats';
  const isCountdownEnabled = vocalMode === 'bar_countdown';
  const isVocalActive = vocalMode !== 'off';
  const displayBeats = Math.min(8, Math.max(1, beatsPerBar));

  const subSyllables =
    subdivision === 'eighth'
      ? ['&']
      : subdivision === 'sixteenth'
      ? ['e', '&', 'a']
      : vocalMode === 'beats_and_sub' && timeline && timeline.subdivisionsPerBeat > 1
      ? subdivision === 'triplet'
        ? ['trip', 'let']
        : subdivision === 'eighth_triplet'
        ? ['la', 'li']
        : subdivision === 'sixteenth_triplet'
        ? ['ta', 'la', 'ta', 'li', 'ta']
        : []
      : [];

  useEffect(() => {
    return () => {
      previewTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handlePreview = () => {
    previewTimersRef.current.forEach((id) => window.clearTimeout(id));
    previewTimersRef.current = [];
    onPreviewVocalCount();

    const beatMs = Math.max(200, Math.min(1000, 60000 / Math.max(20, bpm)));
    for (let i = 0; i < 4; i++) {
      const startId = window.setTimeout(() => setPreviewStep(i), i * beatMs);
      previewTimersRef.current.push(startId);
    }
    const endId = window.setTimeout(() => setPreviewStep(null), 4 * beatMs);
    previewTimersRef.current.push(endId);
  };

  // Determine which beat cue is currently illuminated (live playback or local preview)
  const activeCueIndex =
    previewStep !== null
      ? previewStep
      : timeline?.isPlaying && isVocalActive
      ? vocalMode === 'countin_only' && !timeline.isCountingIn
        ? -1
        : timeline.currentBeat
      : -1;

  const activeSubSyllableIndex =
    timeline?.isPlaying && isVocalActive && subSyllables.length > 0 && timeline.currentSubdivision > 0
      ? timeline.currentSubdivision - 1
      : -1;

  if (variant === 'cue') {
    if (!isVocalActive) return null;

    const cueCount = Math.min(8, Math.max(1, beatsPerBar));
    return (
      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2"
        aria-live="off"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          <Mic className="w-3.5 h-3.5" />
          <span>{isCountdownEnabled ? 'Vocal Countdown' : 'Vocal Cue'}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: cueCount }).map((_, idx) => {
            const active = activeCueIndex === idx && activeSubSyllableIndex === -1;
            return (
              <span
                key={idx}
                className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono-tabular text-xs font-bold transition-all duration-75 ${
                  active
                    ? idx === 0
                      ? 'bg-amber-500 text-zinc-950 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                      : 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950 scale-105'
                    : 'bg-white text-slate-500 border border-slate-200 dark:bg-[#181B23] dark:text-zinc-500 dark:border-white/[0.06]'
                }`}
              >
                {idx + 1}
              </span>
            );
          })}
        </div>
        {subSyllables.length > 0 && (
          <div className="flex items-center gap-1 pl-1 border-l border-amber-500/25">
            {subSyllables.map((syl, sIdx) => {
              const subLit = activeCueIndex !== -1 && activeSubSyllableIndex === sIdx;
              return (
                <span
                  key={`${syl}-${sIdx}`}
                  className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono-tabular text-[11px] font-semibold transition-all duration-75 ${
                    subLit
                      ? 'bg-amber-500/25 text-amber-800 dark:text-amber-200 scale-105'
                      : 'text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  {syl}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Vocal Countdown &amp; Beat Counting
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Sample-locked Web Audio vocal tracks (&ldquo;1, 2, 3, 4&rdquo; with automatic &ldquo;and&rdquo; on 1/8 and &ldquo;e and a&rdquo; on 1/16).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/12 px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 transition whitespace-nowrap"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Preview 1-2-3-4</span>
        </button>
      </div>

      {/* Primary Vocal Countdown Toggle Switch */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-100/75 dark:border-white/[0.08] dark:bg-[#181B23] p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Vocal Countdown
            </span>
            <span
              className={`font-mono-tabular text-[10px] font-semibold uppercase tracking-wider ${
                isCountdownEnabled
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-zinc-500'
              }`}
            >
              {isCountdownEnabled ? 'Armed · Beat 1' : vocalMode === 'off' ? 'Off' : 'Custom Mode'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            Triggers clean vocal counts (1, 2, 3, 4) on the beat, adding &ldquo;and&rdquo; for 1/8 and &ldquo;e and a&rdquo; for 1/16 subdivisions.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isCountdownEnabled}
          aria-label="Vocal Countdown"
          disabled={!isHost}
          onClick={() =>
            onUpdateClickProfile({
              vocalMode: isCountdownEnabled ? 'off' : 'bar_countdown',
            })
          }
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-45 ${
            isCountdownEnabled
              ? 'border-amber-500 bg-amber-500'
              : 'border-slate-300 bg-slate-200 dark:border-white/15 dark:bg-[#0A0B0E]'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              isCountdownEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Live Visual Cue Strip */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/[0.06] dark:bg-[#0D0F14] p-3.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 mb-2.5">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Bar Start Vocal Cue</span>
          </span>
          <span className="font-mono-tabular text-slate-500 dark:text-zinc-500">
            {previewStep !== null
              ? 'PREVIEWING'
              : timeline?.isPlaying
              ? isVocalActive
                ? `BAR ${timeline.isCountingIn ? 'CI' : timeline.currentBar} · SYNCED`
                : 'VOCAL OFF'
              : 'READY'}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {Array.from({ length: previewStep !== null ? 4 : displayBeats }).map((_, idx) => {
            const isLit = activeCueIndex === idx;
            const isDownbeat = idx === 0;
            return (
              <div
                key={idx}
                className={`flex h-11 items-center justify-center rounded-lg border font-display text-base font-bold tabular-nums transition-all duration-75 ${
                  isLit
                    ? isDownbeat
                      ? 'border-amber-400 bg-amber-500 text-zinc-950 scale-[1.04] shadow-[0_0_20px_rgba(245,158,11,0.45)]'
                      : 'border-slate-900 bg-slate-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-950 scale-[1.03]'
                    : isDownbeat && isCountdownEnabled
                    ? 'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-white/[0.07] dark:bg-[#181B23] dark:text-zinc-500'
                }`}
              >
                {idx + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
            Counting Mode
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!isHost}
                onClick={() => onUpdateClickProfile({ vocalMode: m.id })}
                className={`studio-keycap rounded-xl px-3 py-2.5 text-xs font-medium transition text-left ${
                  m.id === 'off' ? 'col-span-2 text-center' : ''
                } ${
                  vocalMode === m.id
                    ? 'bg-amber-500 text-zinc-950 font-semibold shadow-[0_0_16px_rgba(245,158,11,0.25)]'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200/70 dark:border-white/[0.06] dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/[0.06] dark:bg-[#181B23] p-4">
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="font-medium text-slate-700 dark:text-zinc-300">
                Vocal Count Volume
              </span>
              <span className="font-mono-tabular text-amber-600 dark:text-amber-400 font-semibold">
                {Math.round((profile.vocalVolume ?? 0.9) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((profile.vocalVolume ?? 0.9) * 100)}
              disabled={!isHost}
              onChange={(e) =>
                onUpdateClickProfile({ vocalVolume: Number(e.target.value) / 100 })
              }
              style={
                {
                  '--slider-pct': `${Math.round((profile.vocalVolume ?? 0.9) * 100)}%`,
                } as React.CSSProperties
              }
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/[0.06] dark:bg-[#181B23] p-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Click Sound Layer
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                Mute mechanical click to rehearse with vocal counts only
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.clickEnabled ?? true}
              aria-label="Click Sound Layer"
              disabled={!isHost}
              onClick={() =>
                onUpdateClickProfile({ clickEnabled: !(profile.clickEnabled ?? true) })
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-45 ${
                (profile.clickEnabled ?? true)
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-slate-300 bg-slate-200 dark:border-white/15 dark:bg-[#0A0B0E]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  (profile.clickEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
VocalCountdown.displayName = 'VocalCountdown';
