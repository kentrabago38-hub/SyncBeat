import { Mic, Play, Volume2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { ClickProfile, VocalCountMode } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface VocalCountdownProps {
  profile: ClickProfile;
  bpm: number;
  beatsPerBar: number;
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

export const VocalCountdown: React.FC<VocalCountdownProps> = ({
  profile,
  bpm,
  beatsPerBar,
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

  if (variant === 'cue') {
    if (!isVocalActive) return null;

    const cueCount = Math.min(8, Math.max(1, beatsPerBar));
    return (
      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2"
        aria-live="off"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
          <Mic className="w-3.5 h-3.5" />
          <span>{isCountdownEnabled ? 'Vocal Countdown' : 'Vocal Cue'}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: cueCount }).map((_, idx) => {
            const active = activeCueIndex === idx;
            return (
              <span
                key={idx}
                className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono-tabular text-xs font-bold transition-all duration-75 ${
                  active
                    ? idx === 0
                      ? 'bg-amber-500 text-zinc-950 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                      : 'bg-zinc-100 text-zinc-950 scale-105'
                    : 'bg-[#181B23] text-zinc-500 border border-white/[0.06]'
                }`}
              >
                {idx + 1}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="hc-surface studio-panel rounded-2xl border border-white/[0.08] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white tracking-tight">
              Vocal Countdown &amp; Beat Counting
            </h2>
            <p className="text-xs text-zinc-400">
              Sample-locked Web Audio vocal tracks (&ldquo;1, 2, 3, 4&rdquo;) triggered on the AudioContext clock.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/12 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition whitespace-nowrap"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Preview 1-2-3-4</span>
        </button>
      </div>

      {/* Primary Vocal Countdown Toggle Switch */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#181B23] p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Vocal Countdown</span>
            <span
              className={`font-mono-tabular text-[10px] font-semibold uppercase tracking-wider ${
                isCountdownEnabled ? 'text-amber-400' : 'text-zinc-500'
              }`}
            >
              {isCountdownEnabled ? 'Armed · Beat 1' : vocalMode === 'off' ? 'Off' : 'Custom Mode'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Triggers synthetic vocal counts (1, 2, 3, 4) precisely on Beat 1 at the start of each bar.
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
              ? 'border-amber-400 bg-amber-500'
              : 'border-white/15 bg-[#0A0B0E]'
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
      <div className="rounded-xl border border-white/[0.06] bg-[#0D0F14] p-3.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2.5">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Bar Start Vocal Cue</span>
          </span>
          <span className="font-mono-tabular text-zinc-500">
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
                      : 'border-zinc-200 bg-zinc-100 text-zinc-950 scale-[1.03]'
                    : isDownbeat && isCountdownEnabled
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                    : 'border-white/[0.07] bg-[#181B23] text-zinc-500'
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
          <div className="mb-2 text-xs font-medium text-zinc-400">Counting Mode</div>
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
                    : 'border border-white/[0.06] bg-[#181B23] text-zinc-300 hover:bg-white/10'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/[0.06] bg-[#181B23] p-4">
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="font-medium text-zinc-300">Vocal Count Volume</span>
              <span className="font-mono-tabular text-amber-400 font-semibold">
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
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#181B23] p-4 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-white">Click Sound Layer</div>
              <div className="text-[11px] text-zinc-400">
                Mute mechanical click to rehearse with vocal counts only
              </div>
            </div>
            <input
              type="checkbox"
              checked={profile.clickEnabled ?? true}
              disabled={!isHost}
              onChange={(e) =>
                onUpdateClickProfile({ clickEnabled: e.target.checked })
              }
              className="accent-amber-500 h-4 w-4"
            />
          </label>
        </div>
      </div>
    </section>
  );
};
