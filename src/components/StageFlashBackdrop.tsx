import React, { useEffect, useRef } from 'react';
import { BeatAccentType } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface StageFlashBackdropProps {
  enabled: boolean;
  accentPattern: BeatAccentType[];
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  reducedMotion?: boolean;
  theme?: 'dark' | 'light';
  scope?: 'stage' | 'fullscreen';
}

export const StageFlashBackdrop: React.FC<StageFlashBackdropProps> = ({
  enabled,
  accentPattern,
  timeline,
  getTimelineSnapshot,
  reducedMotion = false,
  theme = 'dark',
  scope = 'stage',
}) => {
  const screenAccentRef = useRef<HTMLDivElement | null>(null);
  const screenNormalRef = useRef<HTMLDivElement | null>(null);
  const cardAccentRef = useRef<HTMLDivElement | null>(null);
  const cardNormalRef = useRef<HTMLDivElement | null>(null);

  const getSnapshotRef = useRef(getTimelineSnapshot);
  getSnapshotRef.current = getTimelineSnapshot;
  const accentPatternRef = useRef(accentPattern);
  accentPatternRef.current = accentPattern;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const clearAll = () => {
      for (const ref of [screenAccentRef, screenNormalRef, cardAccentRef, cardNormalRef]) {
        if (ref.current) ref.current.style.opacity = '0';
      }
    };

    if (!enabled || !timeline.isPlaying) {
      clearAll();
      return;
    }

    let rafId = 0;
    let active = true;

    const renderFrame = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        rafId = 0;
        return;
      }

      const snap = getSnapshotRef.current?.() ?? timeline;
      if (!snap.isPlaying) {
        clearAll();
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const pattern = accentPatternRef.current;
      const beatAccent: BeatAccentType = snap.isCountingIn
        ? snap.currentBeat === 0
          ? 'accent'
          : 'normal'
        : pattern[snap.currentBeat] ?? (snap.currentBeat === 0 ? 'accent' : 'normal');

      const envelope = reducedMotionRef.current
        ? Math.max(0, 1 - snap.beatPhase) * 0.42
        : Math.exp(-snap.beatPhase * 6.8);

      const isAccent = beatAccent === 'accent';
      const isMuted = beatAccent === 'mute';

      const accentScreenOpacity = !isMuted && isAccent ? envelope * 0.5 : 0;
      const normalScreenOpacity = !isMuted && !isAccent ? envelope * 0.28 : 0;
      const accentCardOpacity = !isMuted && isAccent ? envelope * 0.38 : 0;
      const normalCardOpacity = !isMuted && !isAccent ? envelope * 0.2 : 0;

      if (screenAccentRef.current) {
        screenAccentRef.current.style.opacity = accentScreenOpacity.toFixed(3);
      }
      if (screenNormalRef.current) {
        screenNormalRef.current.style.opacity = normalScreenOpacity.toFixed(3);
      }
      if (cardAccentRef.current) {
        cardAccentRef.current.style.opacity = accentCardOpacity.toFixed(3);
      }
      if (cardNormalRef.current) {
        cardNormalRef.current.style.opacity = normalCardOpacity.toFixed(3);
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && rafId === 0 && active) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      clearAll();
    };
  }, [enabled, timeline, timeline.isPlaying]);

  if (!enabled) return null;

  const isLight = theme === 'light';

  return (
    <>
      {/* Full-viewport ambient background flash layer (GPU opacity-only) */}
      <div
        ref={screenAccentRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className={`pointer-events-none fixed inset-0 ${
          scope === 'fullscreen' ? 'z-0' : 'z-[1]'
        } will-change-[opacity] ${
          isLight
            ? 'bg-gradient-to-b from-amber-400/85 via-amber-300/65 to-amber-400/85 shadow-[inset_0_0_96px_rgba(217,119,6,0.65)]'
            : 'bg-gradient-to-b from-amber-500/80 via-amber-500/45 to-amber-500/75 shadow-[inset_0_0_120px_rgba(245,158,11,0.75)]'
        }`}
      />
      <div
        ref={screenNormalRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className={`pointer-events-none fixed inset-0 ${
          scope === 'fullscreen' ? 'z-0' : 'z-[1]'
        } will-change-[opacity] ${
          isLight
            ? 'bg-gradient-to-b from-sky-400/65 via-sky-300/45 to-sky-400/65 shadow-[inset_0_0_84px_rgba(2,132,199,0.45)]'
            : 'bg-gradient-to-b from-sky-300/65 via-white/35 to-sky-300/65 shadow-[inset_0_0_96px_rgba(125,211,252,0.55)]'
        }`}
      />

      {/* Local stage card background flash surface */}
      {scope === 'stage' && (
        <>
          <div
            ref={cardAccentRef}
            aria-hidden="true"
            style={{ opacity: 0 }}
            className={`pointer-events-none absolute inset-0 rounded-2xl z-0 will-change-[opacity] ${
              isLight
                ? 'bg-amber-400/75 ring-2 ring-inset ring-amber-500/70'
                : 'bg-amber-500/70 ring-2 ring-inset ring-amber-400/80'
            }`}
          />
          <div
            ref={cardNormalRef}
            aria-hidden="true"
            style={{ opacity: 0 }}
            className={`pointer-events-none absolute inset-0 rounded-2xl z-0 will-change-[opacity] ${
              isLight
                ? 'bg-sky-400/60 ring-1 ring-inset ring-sky-500/60'
                : 'bg-sky-200/55 ring-1 ring-inset ring-white/60'
            }`}
          />
        </>
      )}
    </>
  );
};
