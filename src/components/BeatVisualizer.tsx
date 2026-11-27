import React from 'react';
import { SUBDIVISIONS } from '../constants/metronomeData';
import { BeatAccentType, SubdivisionType, TimeSignature } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface BeatVisualizerProps {
  timeSignature: TimeSignature;
  accentPattern: BeatAccentType[];
  subdivision: SubdivisionType;
  timeline: TimelineSnapshot;
  canEditAccents: boolean;
  onToggleBeatAccent?: (beatIndex: number) => void;
  visualFlash?: boolean;
  large?: boolean;
}

export const BeatVisualizer: React.FC<BeatVisualizerProps> = ({
  timeSignature,
  accentPattern,
  subdivision,
  timeline,
  canEditAccents,
  onToggleBeatAccent,
  visualFlash = true,
  large = false,
}) => {
  const numBeats = Math.max(1, timeSignature.numerator);
  const subMeta = SUBDIVISIONS.find((s) => s.id === subdivision) ?? SUBDIVISIONS[0];
  const subCount = subMeta.perBeat;

  const isBeatActive = (idx: number) => timeline.isPlaying && timeline.currentBeat === idx;
  const activeAccentType = accentPattern[timeline.currentBeat] ?? 'normal';
  const isStrongDownbeat =
    timeline.isPlaying &&
    !timeline.isCountingIn &&
    timeline.currentBeat === 0 &&
    timeline.beatPhase < 0.25 &&
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
      {/* Subtle beat-1 pulse backdrop */}
      {isStrongDownbeat && (
        <div
          className="pointer-events-none absolute -inset-3 rounded-2xl bg-amber-500/[0.06] transition-opacity duration-150"
          aria-hidden="true"
        />
      )}

      {/* Count-In prominent banner */}
      {timeline.isPlaying && timeline.countInDisplayText && (
        <div className="mb-3 flex items-center justify-center gap-3">
          <span className="text-xs font-medium tracking-wider uppercase text-amber-400">
            {timeline.isCountingIn ? 'Count-In' : 'Start'}
          </span>
          <span
            className={`font-display font-bold tabular-nums text-amber-400 ${
              large ? 'text-4xl' : 'text-2xl'
            }`}
          >
            {timeline.countInDisplayText}
          </span>
        </div>
      )}

      {/* Main Beat Orbs */}
      <div
        className={`flex flex-wrap items-center justify-center ${
          large ? 'gap-4 sm:gap-6' : 'gap-2.5 sm:gap-3.5'
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
              : 'w-14 h-14 sm:w-20 sm:h-20 text-xl'
            : numBeats > 8
            ? 'w-9 h-9 sm:w-10 sm:h-10 text-xs'
            : 'w-11 h-11 sm:w-13 sm:h-13 text-sm';

          let orbClasses = 'border-white/10 bg-[#181B23] text-zinc-400';
          if (active) {
            if (isMutedBeat) {
              orbClasses = 'border-zinc-500/40 bg-zinc-800/80 text-zinc-300 scale-105';
            } else if (isAccentBeat || idx === 0) {
              orbClasses =
                'border-amber-400 bg-amber-500 text-zinc-950 scale-110 shadow-[0_0_24px_rgba(245,158,11,0.45)]';
            } else {
              orbClasses =
                'border-zinc-200 bg-zinc-100 text-zinc-950 scale-105 shadow-[0_0_16px_rgba(255,255,255,0.22)]';
            }
          } else if (isAccentBeat) {
            orbClasses = 'border-amber-500/45 bg-amber-500/10 text-amber-300';
          } else if (isMutedBeat) {
            orbClasses = 'border-dashed border-white/15 bg-transparent text-zinc-600';
          }

          return (
            <React.Fragment key={idx}>
              {hasGroupGap && (
                <div
                  className={`${large ? 'h-8' : 'h-6'} w-px bg-white/15 mx-0.5`}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                disabled={!canEditAccents}
                onClick={() => onToggleBeatAccent?.(idx)}
                title={
                  canEditAccents
                    ? `Beat ${idx + 1} (${accent}) — click to cycle Accent / Normal / Mute`
                    : `Beat ${idx + 1}`
                }
                className={`relative flex flex-col items-center justify-center rounded-full border-2 font-mono-tabular font-bold will-change-transform transition-transform duration-75 ${orbSize} ${orbClasses} ${
                  canEditAccents ? 'cursor-pointer hover:border-white/35' : 'cursor-default'
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
        <div className="mt-4 flex items-center justify-center gap-2">
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
                      ? 'bg-amber-500/25 text-amber-300 font-bold'
                      : 'bg-white/15 text-white font-semibold'
                    : 'text-zinc-500'
                }`}
              >
                {syl}
              </div>
            );
          })}
        </div>
      )}

      {/* Bar Phase Progress Rail (GPU-composited scaleX for smooth 60fps mobile operation) */}
      <div className="mx-auto mt-4 max-w-xs">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-500/75 to-amber-400 will-change-transform transition-transform duration-75"
            style={{
              transform: `scaleX(${
                timeline.isPlaying
                  ? Math.min(1, Math.max(0, (timeline.currentBeat + timeline.beatPhase) / numBeats))
                  : 0
              })`,
            }}
          />
        </div>
      </div>

      {/* Bar & Beat Telemetry */}
      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-zinc-400 font-mono-tabular">
        <span>
          BAR <strong className="text-zinc-200">{timeline.isCountingIn ? 'CI' : timeline.currentBar}</strong>
        </span>
        <span className="text-zinc-600" aria-hidden="true">/</span>
        <span>
          BEAT <strong className="text-zinc-200">{timeline.currentBeat + 1}</strong>
          <span className="text-zinc-500"> of {numBeats}</span>
        </span>
        {timeline.isPlaying && (
          <>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className={activeAccentType === 'accent' ? 'text-amber-400 font-semibold' : 'text-zinc-400'}>
              {timeline.isCountingIn ? 'COUNT-IN' : activeAccentType.toUpperCase()}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
