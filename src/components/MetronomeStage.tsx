import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  buildAccentPattern,
  CLICK_SOUNDS,
  SUBDIVISIONS,
  TIME_SIGNATURE_PRESETS,
} from '../constants/metronomeData';
import {
  AccessibilitySettings,
  BeatAccentType,
  ClickProfile,
  CountInBars,
  MetronomePreset,
  MetronomeSessionState,
  RemotePermissions,
  SubdivisionType,
  TimeSignature,
  VocalCountMode,
} from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';
import { BeatVisualizer } from './BeatVisualizer';
import { D3BeatPulseVisualizer } from './D3BeatPulseVisualizer';
import { StageFlashBackdrop } from './StageFlashBackdrop';
import { VocalCountdown } from './VocalCountdown';

interface MetronomeStageProps {
  session: MetronomeSessionState;
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  isHost: boolean;
  permissions: RemotePermissions;
  presets: MetronomePreset[];
  accessibility: AccessibilitySettings;
  localSelfMuted: boolean;
  audioSuspended: boolean;
  tapCount: number;
  tapBpmHistory?: number[];
  onClearTapHistory?: () => void;
  onToggleLocalMute: () => void;
  onUnlockAudio: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onTap: () => void;
  onUpdate: (patch: {
    bpm?: number;
    timeSignature?: TimeSignature;
    accentPattern?: BeatAccentType[];
    subdivision?: SubdivisionType;
    clickProfile?: Partial<ClickProfile>;
    countInBars?: CountInBars;
  }) => void;
  onSelectSong: (index: number) => void;
  onApplyPreset: (preset: MetronomePreset) => void;
  onOpenPerformanceMode: () => void;
  onOpenSoundTab: () => void;
  onToggleStageFlash: () => void;
}

export const MetronomeStage: React.FC<MetronomeStageProps> = React.memo(({
  session,
  timeline,
  getTimelineSnapshot,
  isHost,
  permissions,
  presets,
  accessibility,
  localSelfMuted,
  audioSuspended,
  tapCount,
  tapBpmHistory = [],
  onClearTapHistory,
  onToggleLocalMute,
  onUnlockAudio,
  onPlay,
  onPause,
  onStop,
  onRestart,
  onTap,
  onUpdate,
  onSelectSong,
  onApplyPreset,
  onOpenPerformanceMode,
  onOpenSoundTab,
  onToggleStageFlash,
}) => {
  const [showCustomTs, setShowCustomTs] = useState(false);
  const [tapFeedback, setTapFeedback] = useState(false);
  const dragStartRef = useRef<{ y: number; x: number; bpm: number } | null>(null);

  const canControlTransport = isHost || permissions.playStop;
  const canControlBpm = isHost || permissions.bpm;
  const canControlSetlist = isHost || permissions.setlistNav;

  const activeSong = session.setlist[session.activeSongIndex] ?? null;
  const nextSong =
    session.activeSongIndex + 1 < session.setlist.length
      ? session.setlist[session.activeSongIndex + 1]
      : null;

  const activeClickName =
    CLICK_SOUNDS.find((c) => c.id === session.clickProfile.normalSound)?.name ??
    session.clickProfile.normalSound;
  const activeSubName =
    SUBDIVISIONS.find((s) => s.id === session.subdivision)?.shortLabel ?? '1/4';

  const currentTsPreset = TIME_SIGNATURE_PRESETS.find(
    (p) =>
      p.ts.numerator === session.timeSignature.numerator &&
      p.ts.denominator === session.timeSignature.denominator
  );

  const handleBpmDragStart = (e: React.PointerEvent) => {
    if (!canControlBpm) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, x: e.clientX, bpm: session.bpm };
  };

  const handleBpmDragMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current || !canControlBpm) return;
    const dy = dragStartRef.current.y - e.clientY;
    const dx = e.clientX - dragStartRef.current.x;
    const delta = Math.round((dy + dx * 0.6) / 6);
    const nextBpm = Math.min(300, Math.max(20, Math.round(dragStartRef.current.bpm + delta)));
    if (nextBpm !== session.bpm) {
      onUpdate({ bpm: nextBpm });
    }
  };

  const handleBpmDragEnd = () => {
    dragStartRef.current = null;
  };

  const handleTapClick = () => {
    if (!canControlBpm) return;
    setTapFeedback(true);
    window.setTimeout(() => setTapFeedback(false), 120);
    onTap();
  };

  const cycleBeatAccent = (beatIndex: number) => {
    if (!isHost) return;
    const order: BeatAccentType[] = ['accent', 'normal', 'mute'];
    const current = session.accentPattern[beatIndex] ?? 'normal';
    const next = order[(order.indexOf(current) + 1) % order.length];
    const updated = [...session.accentPattern];
    updated[beatIndex] = next;
    onUpdate({ accentPattern: updated });
  };

  const activeSection =
    activeSong?.tempoSections && activeSong.tempoSections[session.playback.activeSectionIndex];

  const bpmRatio = Math.min(1, Math.max(0, (session.bpm - 20) / (300 - 20)));
  const arcRadius = 92;
  const arcCircumference = 2 * Math.PI * arcRadius;
  const arcSpan = arcCircumference * 0.72; // 260-degree instrument gauge
  const activeArc = arcSpan * bpmRatio;
  const msPerBeat = (60000 / session.bpm).toFixed(1);

  const isLightTheme = accessibility.theme === 'light';

  const stageFlashEnabled = Boolean(accessibility.stageFlash);

  return (
    <div className="space-y-4">
      {/* Primary Metronome Stage Surface */}
      <section className="hc-surface studio-panel relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-4 sm:p-6">
        <StageFlashBackdrop
          enabled={stageFlashEnabled}
          accentPattern={session.accentPattern}
          timeline={timeline}
          getTimelineSnapshot={getTimelineSnapshot}
          reducedMotion={accessibility.reducedMotion}
          theme={accessibility.theme ?? 'dark'}
          scope="stage"
        />
        <div className="relative z-10">
        {/* Stage Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
              {session.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-zinc-500">
              <span>{activeClickName}</span>
              <span aria-hidden="true">·</span>
              <span>Sub {activeSubName}</span>
              {session.countInBars > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Count-in {session.countInBars}b
                  </span>
                </>
              )}
              {stageFlashEnabled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Screen Flash On
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleStageFlash}
              aria-pressed={stageFlashEnabled}
              className={`studio-keycap inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px] ${
                stageFlashEnabled
                  ? 'border-amber-500/60 bg-amber-500 text-zinc-950 shadow-[0_2px_14px_rgba(245,158,11,0.35)]'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
              title={
                stageFlashEnabled
                  ? 'Disable screen background flash (Shortcut: V)'
                  : 'Enable full screen background tempo flash for loud stages (Shortcut: V)'
              }
              aria-label={stageFlashEnabled ? 'Disable Flash Mode' : 'Enable Flash Mode'}
            >
              <Zap className={`w-3.5 h-3.5 ${stageFlashEnabled ? 'fill-current' : ''}`} />
              <span>Flash</span>
            </button>

            <button
              type="button"
              onClick={onToggleLocalMute}
              className={`studio-keycap inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-xl border transition active:scale-95 ${
                localSelfMuted
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
              title={localSelfMuted ? 'Unmute my device audio' : 'Mute my device audio'}
              aria-label={localSelfMuted ? 'Unmute my device audio' : 'Mute my device audio'}
            >
              {localSelfMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenPerformanceMode}
              className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 transition-colors active:scale-[0.97] whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-[40px]"
              title="Open fullscreen Performance Mode (Shortcut: F)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Stage View</span>
              <span className="sm:hidden">Stage</span>
            </button>
          </div>
        </div>

        {/* Mobile Browser Audio Unlock Prompt (when joining a playing session) */}
        {audioSuspended && timeline.isPlaying && (
          <button
            type="button"
            onClick={onUnlockAudio}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 transition min-h-[44px]"
          >
            <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Audio paused by browser — Tap here to enable sound</span>
          </button>
        )}

        {/* Dual-Zone Precision Stage Console: Tempo Deck (Left) + Pulse Visualizer Bay (Right) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Left Column: BPM Focal Anchor & Fine Controls */}
          <div className="md:col-span-6 flex flex-col items-center">
            <div
              onPointerDown={handleBpmDragStart}
              onPointerMove={handleBpmDragMove}
              onPointerUp={handleBpmDragEnd}
              onPointerCancel={handleBpmDragEnd}
              className={`relative flex h-[184px] w-[212px] sm:h-[214px] sm:w-[244px] flex-col items-center justify-center select-none text-center ${
                canControlBpm ? 'cursor-ns-resize touch-none' : ''
              }`}
              title={canControlBpm ? 'Drag up/down or left/right to adjust BPM' : 'Synced to Host BPM'}
            >
              <svg
                viewBox="0 0 220 220"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <g transform="rotate(140 110 110)">
                  <circle
                    cx="110"
                    cy="110"
                    r={arcRadius}
                    fill="none"
                    stroke={isLightTheme ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.07)'}
                    strokeWidth="6"
                    strokeDasharray={`${arcSpan} ${arcCircumference}`}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r={arcRadius}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="6"
                    strokeDasharray={`${activeArc} ${arcCircumference}`}
                    strokeLinecap="round"
                    className="transition-[stroke-dasharray] duration-100"
                  />
                </g>
              </svg>

              <div className="relative z-10 flex flex-col items-center pt-1">
                <div
                  className={`font-display font-extrabold leading-none tracking-tight tabular-nums text-slate-900 dark:text-white transition-transform duration-75 ${
                    accessibility.largeText
                      ? 'text-[4.25rem] sm:text-[5rem]'
                      : 'text-[3.5rem] sm:text-[4.4rem]'
                  }`}
                >
                  {Number.isInteger(session.bpm) ? session.bpm : session.bpm.toFixed(1)}
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-zinc-400">
                  <span>BPM</span>
                  <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>
                  <span className="font-mono-tabular tracking-normal text-amber-600 dark:text-amber-400/90">
                    {msPerBeat} ms
                  </span>
                </div>
                {canControlBpm && (
                  <div className="mt-1 text-[10px] font-medium text-slate-400 dark:text-zinc-500 hidden sm:block">
                    Drag dial or tap tempo
                  </div>
                )}
              </div>
            </div>

            {/* Coarse & Tap Controls */}
            <div className="mt-2 flex items-center justify-center gap-2.5 w-full max-w-sm">
              <button
                type="button"
                disabled={!canControlBpm}
                onClick={() => onUpdate({ bpm: session.bpm - 1 })}
                className="studio-keycap flex h-12 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-100 dark:hover:bg-white/10 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition"
                aria-label="Decrease BPM by 1"
              >
                <Minus className="w-5 h-5" />
              </button>

              <button
                type="button"
                disabled={!canControlBpm}
                onClick={handleTapClick}
                className={`studio-keycap flex-1 h-12 rounded-xl border font-display text-sm font-bold tracking-wider uppercase transition active:scale-[0.97] disabled:opacity-35 disabled:pointer-events-none ${
                  tapFeedback
                    ? 'border-amber-400 bg-amber-500 text-zinc-950 ring-4 ring-amber-500/25'
                    : 'border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200 dark:border-white/15 dark:bg-[#181B23] dark:text-white dark:hover:bg-white/10'
                }`}
              >
                {tapCount > 0 ? `Tap Tempo · ${tapCount}` : 'Tap Tempo'}
              </button>

              <button
                type="button"
                disabled={!canControlBpm}
                onClick={() => onUpdate({ bpm: session.bpm + 1 })}
                className="studio-keycap flex h-12 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-100 dark:hover:bg-white/10 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition"
                aria-label="Increase BPM by 1"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Fine BPM Stepper & Calibrated Range Slider */}
            {canControlBpm && (
              <div className="mt-3.5 w-full max-w-sm space-y-2.5">
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={1}
                  value={Math.round(session.bpm)}
                  onChange={(e) => onUpdate({ bpm: Number(e.target.value) })}
                  aria-label="Tempo BPM slider"
                  style={{ '--slider-pct': `${(bpmRatio * 100).toFixed(1)}%` } as React.CSSProperties}
                  className="studio-slider w-full cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdate({ bpm: session.bpm - 5 })}
                      className="studio-keycap rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/[0.06] dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 font-mono-tabular min-h-[38px] sm:min-h-[34px] active:scale-95 transition"
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate({ bpm: session.bpm - 0.5 })}
                      className="studio-keycap rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-white/[0.06] dark:bg-[#181B23] dark:text-zinc-400 dark:hover:bg-white/10 font-mono-tabular min-h-[38px] sm:min-h-[34px] active:scale-95 transition"
                    >
                      -0.5
                    </button>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-500 dark:text-zinc-500">20–300</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdate({ bpm: session.bpm + 0.5 })}
                      className="studio-keycap rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-white/[0.06] dark:bg-[#181B23] dark:text-zinc-400 dark:hover:bg-white/10 font-mono-tabular min-h-[38px] sm:min-h-[34px] active:scale-95 transition"
                    >
                      +0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate({ bpm: session.bpm + 5 })}
                      className="studio-keycap rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/[0.06] dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 font-mono-tabular min-h-[38px] sm:min-h-[34px] active:scale-95 transition"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Tap BPM Consistency History (Last 5 intervals) */}
            {tapBpmHistory.length > 0 && (
              <div
                className="mt-3 w-full max-w-sm rounded-xl border border-slate-200/80 bg-slate-50/85 dark:border-white/[0.06] dark:bg-[#0D0F14]/85 px-3 py-2"
                aria-label="Recent tapped BPM history"
              >
                <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-500 mb-1.5">
                  <span>Last {tapBpmHistory.length} Taps</span>
                  <div className="flex items-center gap-2 font-mono-tabular normal-case tracking-normal">
                    {tapBpmHistory.length >= 2 && (() => {
                      const spread = Math.max(...tapBpmHistory) - Math.min(...tapBpmHistory);
                      const spreadTone =
                        spread <= 2
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : spread <= 5
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-zinc-400';
                      return (
                        <span className={spreadTone}>
                          {spread === 0 ? 'Locked (±0)' : `Spread ±${spread}`}
                        </span>
                      );
                    })()}
                    {onClearTapHistory && (
                      <button
                        type="button"
                        onClick={onClearTapHistory}
                        className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
                        aria-label="Clear tap history"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const val = tapBpmHistory[idx];
                    const isLatest = idx === tapBpmHistory.length - 1;
                    if (val === undefined) {
                      return (
                        <div
                          key={idx}
                          className="flex h-7 items-center justify-center rounded-md border border-dashed border-slate-200/80 dark:border-white/[0.06] font-mono-tabular text-[11px] text-slate-300 dark:text-zinc-700"
                        >
                          —
                        </div>
                      );
                    }
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!canControlBpm}
                        onClick={() => onUpdate({ bpm: val })}
                        title={canControlBpm ? `Apply ${val} BPM` : `${val} BPM`}
                        className={`flex h-7 items-center justify-center rounded-md border font-mono-tabular text-xs transition active:scale-95 disabled:pointer-events-none ${
                          isLatest
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#181B23] dark:text-zinc-300 dark:hover:border-white/20 font-medium'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Beat Pulse Visualizer Bay */}
          <div className="md:col-span-6 rounded-2xl border border-slate-200/75 bg-slate-50/75 dark:border-white/[0.06] dark:bg-[#0D0F14]/85 p-4 sm:p-5 flex flex-col items-center">
            <D3BeatPulseVisualizer
              bpm={session.bpm}
              timeSignature={session.timeSignature}
              accentPattern={session.accentPattern}
              subdivision={session.subdivision}
              timeline={timeline}
              getTimelineSnapshot={getTimelineSnapshot}
              canEditAccents={isHost}
              onToggleBeatAccent={cycleBeatAccent}
              visualFlash={accessibility.visualFlash}
              reducedMotion={accessibility.reducedMotion}
              theme={accessibility.theme ?? 'dark'}
            />
            <div className="mt-3.5 w-full">
              <BeatVisualizer
                timeSignature={session.timeSignature}
                accentPattern={session.accentPattern}
                subdivision={session.subdivision}
                timeline={timeline}
                getTimelineSnapshot={getTimelineSnapshot}
                canEditAccents={isHost}
                onToggleBeatAccent={cycleBeatAccent}
                visualFlash={accessibility.visualFlash}
              />
            </div>
            <VocalCountdown
              variant="cue"
              profile={session.clickProfile}
              bpm={session.bpm}
              beatsPerBar={session.timeSignature.numerator}
              subdivision={session.subdivision}
              isHost={isHost}
              timeline={timeline}
              onUpdateClickProfile={(patch) => onUpdate({ clickProfile: patch })}
              onPreviewVocalCount={() => undefined}
            />
            {isHost && (
              <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-zinc-500">
                Tap any beat circle to cycle Accent, Normal, or Mute
              </p>
            )}
          </div>
        </div>

        {/* Primary Transport Bar (Always accessible immediately below Tempo/Pulse deck) */}
        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-center gap-3">
          {canControlTransport ? (
            <>
              <button
                type="button"
                onClick={onRestart}
                className="studio-keycap flex h-13 w-13 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white active:scale-95 transition"
                title="Restart from Bar 1"
                aria-label="Restart from Bar 1"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={timeline.isPlaying ? onPause : onPlay}
                className={`flex h-14 flex-1 max-w-[260px] items-center justify-center gap-2.5 rounded-2xl font-display text-base font-bold tracking-wide transition active:scale-[0.98] ${
                  timeline.isPlaying
                    ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white'
                    : 'bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-[0_6px_24px_rgba(245,158,11,0.28)]'
                }`}
              >
                {timeline.isPlaying ? (
                  <>
                    <Pause className="w-5 h-5 fill-current" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>PLAY</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onStop}
                className="studio-keycap flex h-13 w-13 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white active:scale-95 transition"
                title="Stop & Reset"
                aria-label="Stop and reset"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-3 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300">
              {timeline.isPlaying
                ? 'Synced playback active — controlled by Host'
                : 'Waiting for Host to start metronome'}
            </div>
          )}
        </div>

        {/* Time Signature, Subdivision & Count-In Strip */}
        {isHost && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-white/[0.06] space-y-4">
            {/* Time Signature Row */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Time Signature</span>
                <button
                  type="button"
                  onClick={() => setShowCustomTs((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 py-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{showCustomTs ? 'Hide Custom' : 'Custom / Grouping'}</span>
                </button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {TIME_SIGNATURE_PRESETS.map((preset) => {
                  const selected =
                    session.timeSignature.numerator === preset.ts.numerator &&
                    session.timeSignature.denominator === preset.ts.denominator;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onUpdate({
                          timeSignature: { ...preset.ts },
                          accentPattern: buildAccentPattern(preset.ts),
                        })
                      }
                      className={`h-11 sm:h-10 rounded-lg font-mono-tabular text-xs font-semibold transition active:scale-95 ${
                        selected
                          ? 'bg-amber-500 text-zinc-950 shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Grouping selector for odd meters like 7/8 (2+2+3 vs 3+2+2) */}
              {currentTsPreset?.groupings && currentTsPreset.groupings.length > 1 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-zinc-500">Accent Grouping:</span>
                  {currentTsPreset.groupings.map((grp) => {
                    const grpLabel = grp.join(' + ');
                    const isSame =
                      JSON.stringify(session.timeSignature.grouping) === JSON.stringify(grp);
                    return (
                      <button
                        key={grpLabel}
                        type="button"
                        onClick={() => {
                          const nextTs: TimeSignature = {
                            ...session.timeSignature,
                            grouping: grp,
                          };
                          onUpdate({
                            timeSignature: nextTs,
                            accentPattern: buildAccentPattern(nextTs),
                          });
                        }}
                        className={`rounded-lg px-2.5 py-1.5 font-mono-tabular text-xs transition min-h-[36px] ${
                          isSame
                            ? 'bg-amber-500/15 text-amber-800 dark:bg-white/15 dark:text-amber-300 font-semibold'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-[#181B23] dark:text-zinc-400 dark:hover:text-zinc-200'
                        }`}
                      >
                        {grpLabel}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom Time Signature */}
              {showCustomTs && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100 dark:bg-[#181B23] p-3">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300">
                    <span>Beats</span>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={session.timeSignature.numerator}
                      onChange={(e) => {
                        const num = Math.max(1, Math.min(16, Number(e.target.value) || 4));
                        const nextTs: TimeSignature = {
                          numerator: num,
                          denominator: session.timeSignature.denominator,
                        };
                        onUpdate({
                          timeSignature: nextTs,
                          accentPattern: buildAccentPattern(nextTs),
                        });
                      }}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300">
                    <span>Note Value</span>
                    <select
                      value={session.timeSignature.denominator}
                      onChange={(e) => {
                        const denom = Number(e.target.value) as 2 | 4 | 8 | 16;
                        const nextTs: TimeSignature = {
                          ...session.timeSignature,
                          denominator: denom,
                        };
                        onUpdate({ timeSignature: nextTs });
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                    >
                      <option value={2}>2 (Half)</option>
                      <option value={4}>4 (Quarter)</option>
                      <option value={8}>8 (Eighth)</option>
                      <option value={16}>16 (Sixteenth)</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            {/* Subdivision + Count-in Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Subdivision</span>
                  <button
                    type="button"
                    onClick={onOpenSoundTab}
                    className="text-xs text-slate-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-300"
                  >
                    Click Sounds →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SUBDIVISIONS.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onUpdate({ subdivision: sub.id })}
                      className={`h-11 sm:h-10 rounded-lg px-2 font-mono-tabular text-xs font-medium transition active:scale-95 whitespace-nowrap truncate ${
                        session.subdivision === sub.id
                          ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10'
                      }`}
                      title={sub.label}
                    >
                      {sub.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-600 dark:text-zinc-400">Count-In Bars</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {([0, 1, 2, 4, 8] as CountInBars[]).map((bars) => (
                    <button
                      key={bars}
                      type="button"
                      onClick={() => onUpdate({ countInBars: bars })}
                      className={`h-11 sm:h-10 rounded-lg font-mono-tabular text-xs font-medium transition active:scale-95 ${
                        session.countInBars === bars
                          ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10'
                      }`}
                    >
                      {bars === 0 ? 'Off' : `${bars}b`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vocal Counting & Click Layer Row */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-9">
                <div className="mb-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Vocal Beat Counting
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: 'off', label: 'Off' },
                      { id: 'bar_countdown', label: 'Countdown' },
                      { id: 'beats', label: 'Beats (1-4)' },
                      { id: 'countin_only', label: 'Count-In' },
                      { id: 'beats_and_sub', label: 'Beats + &' },
                    ] as Array<{ id: VocalCountMode; label: string }>
                  ).map((mode) => {
                    const active = (session.clickProfile.vocalMode ?? 'beats') === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          onUpdate({ clickProfile: { vocalMode: mode.id } })
                        }
                        className={`studio-keycap h-11 sm:h-10 rounded-lg px-2 text-xs font-medium transition active:scale-95 whitespace-nowrap truncate ${
                          active
                            ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-3">
                <div className="mb-2 text-xs font-medium text-slate-600 dark:text-zinc-400">Click Pulse</div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      clickProfile: {
                        clickEnabled: !(session.clickProfile.clickEnabled ?? true),
                      },
                    })
                  }
                  className={`studio-keycap w-full h-11 sm:h-10 rounded-lg text-xs font-semibold transition active:scale-95 ${
                    (session.clickProfile.clickEnabled ?? true)
                      ? 'bg-slate-900 text-white border border-slate-900 dark:bg-white/15 dark:text-white dark:border-white/20'
                      : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-[#181B23] dark:text-zinc-500 dark:border-white/5'
                  }`}
                >
                  {(session.clickProfile.clickEnabled ?? true) ? 'Click: On' : 'Click: Off'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </section>

      {/* Active Setlist Song Cue Card */}
      {session.setlist.length > 0 && (
        <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={!canControlSetlist || session.activeSongIndex <= 0}
              onClick={() => onSelectSong(session.activeSongIndex - 1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
              aria-label="Previous song"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Set {String(session.activeSongIndex + 1).padStart(2, '0')} /{' '}
                {String(session.setlist.length).padStart(2, '0')}
                {activeSection ? ` · ${activeSection.label}` : ''}
              </div>
              <div className="mt-0.5 font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {activeSong ? activeSong.songName : 'No song selected'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400 truncate">
                {nextSong ? (
                  <span>
                    Next: <strong className="text-slate-900 dark:text-zinc-200">{nextSong.songName}</strong> ·{' '}
                    <span className="font-mono-tabular">{nextSong.bpm} BPM</span> ·{' '}
                    <span className="font-mono-tabular">
                      {nextSong.timeSignature.numerator}/{nextSong.timeSignature.denominator}
                    </span>
                  </span>
                ) : (
                  <span>Final song in setlist</span>
                )}
              </div>
              {activeSong?.notes && (
                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300/85 truncate">
                  {activeSong.notes}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canControlSetlist || session.activeSongIndex >= session.setlist.length - 1}
              onClick={() => onSelectSong(session.activeSongIndex + 1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
              aria-label="Next song"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      )}

      {/* Quick Presets Strip */}
      {isHost && presets.length > 0 && (
        <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Quick Presets</h2>
          </div>
          <div className="scroll-touch flex items-center gap-2 overflow-x-auto pb-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className="studio-keycap shrink-0 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-left hover:border-amber-500/50 hover:bg-amber-500/10 dark:border-white/10 dark:bg-[#181B23] dark:hover:border-amber-500/40 dark:hover:bg-white/[0.06] transition"
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                  {preset.name}
                </div>
                <div className="mt-0.5 font-mono-tabular text-[11px] text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                  {preset.bpm} BPM · {preset.timeSignature.numerator}/{preset.timeSignature.denominator}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});
MetronomeStage.displayName = 'MetronomeStage';
