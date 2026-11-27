import React, { useEffect, useRef } from 'react';
import { SUBDIVISIONS } from '../constants/metronomeData';
import { BeatAccentType, SubdivisionType, TimeSignature } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface BeatVisualizerProps {
  timeSignature: TimeSignature;
  accentPattern: BeatAccentType[];
  subdivision: SubdivisionType;
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  canEditAccents: boolean;
  onToggleBeatAccent?: (beatIndex: number) => void;
  visualFlash?: boolean;
  large?: boolean;
}

export const BeatVisualizer: React.FC<BeatVisualizerProps> = React.memo(({
  timeSignature,
  accentPattern,
  subdivision,
  timeline,
  getTimelineSnapshot,
  canEditAccents,
  onToggleBeatAccent,
  visualFlash = true,
  large = false,
}) => {
  const numBeats = Math.max(1, timeSignature.numerator);
  const subMeta = SUBDIVISIONS.find((s) => s.id === subdivision) ?? SUBDIVISIONS[0];
  const subCount = subMeta.perBeat;

  const progressRailRef = useRef<HTMLDivElement | null>(null);
  const getSnapshotRef = useRef(getTimelineSnapshot);
  getSnapshotRef.current = getTimelineSnapshot;
  const latestTimelineRef = useRef(timeline);
  latestTimelineRef.current = timeline;

  // Drive smooth GPU-composited scaleX progress rail directly without React re-renders
  useEffect(() => {
    const el = progressRailRef.current;
    if (!el) return;

    if (!timeline.isPlaying || !getSnapshotRef.current) {
      const staticRatio = timeline.isPlaying
        ? Math.min(1, Math.max(0, (latestTimelineRef.current.currentBeat + latestTimelineRef.current.beatPhase) / numBeats))
        : 0;
      el.style.transform = `scaleX(${staticRatio.toFixed(4)})`;
      return;
    }

    let rafId = 0;
    let active = true;

    const tick = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        rafId = 0;
        return;
      }
      const snap = getSnapshotRef.current?.();
      if (snap && el) {
        const ratio = snap.isPlaying
          ? Math.min(1, Math.max(0, (snap.currentBeat + snap.beatPhase) / numBeats))
          : 0;
        el.style.transform = `scaleX(${ratio.toFixed(4)})`;
      }
      rafId = requestAnimationFrame(tick);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && rafId === 0 && active) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [numBeats, timeline.isPlaying]);

  const isBeatActive = (idx: number) => timeline.isPlaying && timeline.currentBeat === idx;
  const activeAccentType = accentPattern[timeline.currentBeat] ?? 'normal';
  const isStrongDownbeat =
    timeline.isPlaying &&
    !timeline.isCountingIn &&
    timeline.currentBeat === 0 &&
    visualFlash;

  // Group separators for compound/asymmetric meters like 7/8 (2+2+3)
  const groupStarts = new Set<number>();
  if (timeSignature.grouping && timeSignature.grouping.length > 1) {
    let cursor = 0;
    for (let g = 0; g < timeSignature.grouping.length - 1; g++) {
      cursor += timeSignature.grouping[g];
      if (cursor < numBeats) groupStarts.add(cursor);
    }
  }

  return (
    <div className="relative w-full">
      {/* Subtle beat-1 pulse backdrop (compositor opacity only) */}
      <div
        className={`pointer-events-none absolute -inset-2 rounded-2xl bg-amber-500/[0.06] transition-opacity duration-150 ${
          isStrongDownbeat ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Count-In prominent banner */}
      {timeline.isPlaying && timeline.countInDisplayText && (
        <div className="mb-3 flex items-center justify-center gap-3">
          <span className="text-xs font-medium tracking-wider uppercase text-amber-600 dark:text-amber-400">
            {timeline.isCountingIn ? 'Count-In' : 'Start'}
          </span>
          <span
            className={`font-display font-bold tabular-nums text-amber-600 dark:text-amber-400 ${
              large ? 'text-4xl' : 'text-2xl'
            }`}
          >
            {timeline.countInDisplayText}
          </span>
        </div>
      )}

      {/* Main Beat Orbs */}
      <div
        className={`relative flex flex-wrap items-center justify-center ${
          large ? 'gap-3.5 sm:gap-5' : 'gap-2 sm:gap-3'
        }`}
      >
        {Array.from({ length: numBeats }).map((_, idx) => {
          const accent = accentPattern[idx] ?? (idx === 0 ? 'accent' : 'normal');
          const active = isBeatActive(idx);
          const isAccentBeat = accent === 'accent';
          const isMutedBeat = accent === 'mute';
          const hasGroupGap = groupStarts.has(idx);

          const orbSize = large
            ? numBeats > 8
              ? 'w-11 h-11 sm:w-14 sm:h-14 text-base'
              : 'w-14 h-14 sm:w-18 sm:h-18 text-xl'
            : numBeats > 8
            ? 'w-10 h-10 text-xs'
            : 'w-11 h-11 sm:w-12 sm:h-12 text-sm';

          let orbClasses =
            'border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-400';
          if (active) {
            if (isMutedBeat) {
              orbClasses =
                'border-slate-400 bg-slate-200 text-slate-700 dark:border-zinc-500/40 dark:bg-zinc-800/80 dark:text-zinc-300 scale-105';
            } else if (isAccentBeat || idx === 0) {
              orbClasses =
                'border-amber-400 bg-amber-500 text-zinc-950 scale-110 ring-4 ring-amber-500/25';
            } else {
              orbClasses =
                'border-slate-900 bg-slate-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-950 scale-105 ring-2 ring-slate-900/15 dark:ring-white/20';
            }
          } else if (isAccentBeat) {
            orbClasses =
              'border-amber-500/50 bg-amber-500/12 text-amber-700 dark:border-amber-500/45 dark:bg-amber-500/10 dark:text-amber-300';
          } else if (isMutedBeat) {
            orbClasses =
              'border-dashed border-slate-300 bg-transparent text-slate-400 dark:border-white/15 dark:text-zinc-600';
          }

          return (
            <React.Fragment key={idx}>
              {hasGroupGap && (
                <div
                  className={`${large ? 'h-8' : 'h-6'} w-px bg-slate-300 dark:bg-white/15 mx-0.5`}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                disabled={!canEditAccents}
                onClick={() => onToggleBeatAccent?.(idx)}
                title={
                  canEditAccents
                    ? `Beat ${idx + 1} (${accent}) — tap to cycle Accent / Normal / Mute`
                    : `Beat ${idx + 1}`
                }
                className={`relative flex flex-col items-center justify-center rounded-full border-2 font-mono-tabular font-bold will-change-transform transition-transform duration-75 active:scale-95 ${orbSize} ${orbClasses} ${
                  canEditAccents
                    ? 'cursor-pointer hover:border-slate-400 dark:hover:border-white/35'
                    : 'cursor-default'
                }`}
                aria-label={`Beat ${idx + 1}: ${accent}`}
              >
                <span>{idx + 1}</span>
                {isAccentBeat && !active && (
                  <span
                    className="absolute -bottom-1.5 h-1 w-3 rounded-full bg-amber-500/80"
                    aria-hidden="true"
                  />
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Subdivision Strip */}
      {subCount > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5">
          {subMeta.syllables.map((syl, sIdx) => {
            const subActive =
              timeline.isPlaying && timeline.currentSubdivision === sIdx;
            const isBeatAnchor = sIdx === 0;
            return (
              <div
                key={`${syl}-${sIdx}`}
                className={`flex items-center justify-center rounded-md px-2.5 py-1 font-mono-tabular text-xs transition-colors duration-75 ${
                  subActive
                    ? isBeatAnchor
                      ? 'bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300 font-bold'
                      : 'bg-slate-900 text-white dark:bg-white/15 dark:text-white font-semibold'
                    : 'text-slate-500 dark:text-zinc-500'
                }`}
              >
                {syl}
              </div>
            );
          })}
        </div>
      )}

      {/* Bar Phase Progress Rail (GPU-composited scaleX driven directly at 60/120fps) */}
      <div className="mx-auto mt-3.5 max-w-xs">
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.06]">
          <div
            ref={progressRailRef}
            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-500/90 to-amber-400 will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>

      {/* Bar & Beat Telemetry */}
      <div className="mt-2.5 flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-zinc-400 font-mono-tabular">
        <span>
          BAR{' '}
          <strong className="text-slate-900 dark:text-zinc-200">
            {timeline.isCountingIn ? 'CI' : timeline.currentBar}
          </strong>
        </span>
        <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">/</span>
        <span>
          BEAT <strong className="text-slate-900 dark:text-zinc-200">{timeline.currentBeat + 1}</strong>
          <span className="text-slate-400 dark:text-zinc-500"> of {numBeats}</span>
        </span>
        {timeline.isPlaying && (
          <>
            <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>
            <span
              className={
                activeAccentType === 'accent'
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-slate-500 dark:text-zinc-400'
              }
            >
              {timeline.isCountingIn ? 'COUNT-IN' : activeAccentType.toUpperCase()}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
BeatVisualizer.displayName = 'BeatVisualizer';
