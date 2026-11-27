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
import { VocalCountdown } from './VocalCountdown';

interface MetronomeStageProps {
  session: MetronomeSessionState;
  timeline: TimelineSnapshot;
  isHost: boolean;
  permissions: RemotePermissions;
  presets: MetronomePreset[];
  accessibility: AccessibilitySettings;
  localSelfMuted: boolean;
  audioSuspended: boolean;
  tapCount: number;
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
}

export const MetronomeStage: React.FC<MetronomeStageProps> = React.memo(({
  session,
  timeline,
  isHost,
  permissions,
  presets,
  accessibility,
  localSelfMuted,
  audioSuspended,
  tapCount,
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

  return (
    <div className="space-y-4">
      {/* Primary Metronome Stage Surface */}
      <section className="hc-surface studio-panel rounded-2xl border border-white/[0.08] p-5 sm:p-7">
        {/* Stage Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-400 truncate">
              {session.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <span>{activeClickName}</span>
              <span aria-hidden="true">·</span>
              <span>Sub {activeSubName}</span>
              {session.countInBars > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Count-in {session.countInBars}b</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLocalMute}
              className={`studio-keycap inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                localSelfMuted
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : 'border-white/10 bg-[#181B23] text-zinc-300 hover:bg-white/10 hover:text-white'
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
              className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181B23] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              title="Open fullscreen Performance Mode (Shortcut: F)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Stage View</span>
            </button>
          </div>
        </div>

        {/* Mobile Browser Audio Unlock Prompt (when joining a playing session) */}
        {audioSuspended && timeline.isPlaying && (
          <button
            type="button"
            onClick={onUnlockAudio}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition"
          >
            <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Audio paused by browser — Tap here to enable sound</span>
          </button>
        )}

        {/* BPM Focal Anchor with Calibrated Tempo Gauge */}
        <div className="mt-4 flex flex-col items-center">
          <div
            onPointerDown={handleBpmDragStart}
            onPointerMove={handleBpmDragMove}
            onPointerUp={handleBpmDragEnd}
            onPointerCancel={handleBpmDragEnd}
            className={`relative flex h-[212px] w-[240px] sm:h-[236px] sm:w-[270px] flex-col items-center justify-center select-none text-center ${
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
                  stroke="rgba(255,255,255,0.07)"
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
                className={`font-display font-extrabold leading-none tracking-tight tabular-nums text-white transition-transform duration-75 ${
                  accessibility.largeText
                    ? 'text-[4.75rem] sm:text-[5.75rem]'
                    : 'text-[4rem] sm:text-[4.85rem]'
                }`}
              >
                {Number.isInteger(session.bpm) ? session.bpm : session.bpm.toFixed(1)}
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-400">
                <span>BPM</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span className="font-mono-tabular tracking-normal text-amber-400/90">
                  {msPerBeat} ms
                </span>
              </div>
              {canControlBpm && (
                <div className="mt-1 text-[10px] font-medium text-zinc-500 hidden sm:block">
                  Drag dial or tap tempo
                </div>
              )}
            </div>
          </div>

          {/* Coarse & Tap Controls */}
          <div className="mt-2 flex items-center justify-center gap-3 w-full max-w-md">
            <button
              type="button"
              disabled={!canControlBpm}
              onClick={() => onUpdate({ bpm: session.bpm - 1 })}
              className="studio-keycap flex h-12 w-14 sm:w-16 items-center justify-center rounded-xl border border-white/10 bg-[#181B23] text-zinc-100 hover:bg-white/10 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition"
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
                  ? 'border-amber-400 bg-amber-500 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                  : 'border-white/15 bg-[#181B23] text-white hover:bg-white/10'
              }`}
            >
              {tapCount > 0 ? `Tap Tempo · ${tapCount}` : 'Tap Tempo'}
            </button>

            <button
              type="button"
              disabled={!canControlBpm}
              onClick={() => onUpdate({ bpm: session.bpm + 1 })}
              className="studio-keycap flex h-12 w-14 sm:w-16 items-center justify-center rounded-xl border border-white/10 bg-[#181B23] text-zinc-100 hover:bg-white/10 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition"
              aria-label="Increase BPM by 1"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Fine BPM Stepper & Range Slider */}
          {canControlBpm && (
            <div className="mt-4 w-full max-w-md space-y-2.5">
              <input
                type="range"
                min={20}
                max={300}
                step={1}
                value={Math.round(session.bpm)}
                onChange={(e) => onUpdate({ bpm: Number(e.target.value) })}
                aria-label="Tempo BPM slider"
                className="studio-slider w-full cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdate({ bpm: session.bpm - 5 })}
                    className="studio-keycap rounded-lg border border-white/[0.06] px-2.5 py-1.5 bg-[#181B23] text-zinc-300 hover:bg-white/10 font-mono-tabular min-h-[32px]"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ bpm: session.bpm - 0.5 })}
                    className="studio-keycap rounded-lg border border-white/[0.06] px-2.5 py-1.5 bg-[#181B23] text-zinc-400 hover:bg-white/10 font-mono-tabular min-h-[32px]"
                  >
                    -0.5
                  </button>
                </div>
                <span className="font-mono-tabular text-zinc-500">20 – 300 BPM</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdate({ bpm: session.bpm + 0.5 })}
                    className="studio-keycap rounded-lg border border-white/[0.06] px-2.5 py-1.5 bg-[#181B23] text-zinc-400 hover:bg-white/10 font-mono-tabular min-h-[32px]"
                  >
                    +0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ bpm: session.bpm + 5 })}
                    className="studio-keycap rounded-lg border border-white/[0.06] px-2.5 py-1.5 bg-[#181B23] text-zinc-300 hover:bg-white/10 font-mono-tabular min-h-[32px]"
                  >
                    +5
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Beat Visualizer */}
        <div className="mt-7 pt-6 border-t border-white/[0.06]">
          <BeatVisualizer
            timeSignature={session.timeSignature}
            accentPattern={session.accentPattern}
            subdivision={session.subdivision}
            timeline={timeline}
            canEditAccents={isHost}
            onToggleBeatAccent={cycleBeatAccent}
            visualFlash={accessibility.visualFlash}
          />
          <VocalCountdown
            variant="cue"
            profile={session.clickProfile}
            bpm={session.bpm}
            beatsPerBar={session.timeSignature.numerator}
            isHost={isHost}
            timeline={timeline}
            onUpdateClickProfile={(patch) => onUpdate({ clickProfile: patch })}
            onPreviewVocalCount={() => undefined}
          />
          {isHost && (
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              Tap any beat circle to cycle Accent, Normal, or Mute
            </p>
          )}
        </div>

        {/* Primary Transport Bar */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {canControlTransport ? (
            <>
              <button
                type="button"
                onClick={onRestart}
                className="flex h-13 w-13 items-center justify-center rounded-2xl border border-white/10 bg-[#181B23] text-zinc-300 hover:bg-white/10 hover:text-white active:scale-95 transition"
                title="Restart from Bar 1"
                aria-label="Restart from Bar 1"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={timeline.isPlaying ? onPause : onPlay}
                className={`flex h-14 flex-1 max-w-[220px] items-center justify-center gap-2.5 rounded-2xl font-display text-base font-bold tracking-wide transition active:scale-[0.98] ${
                  timeline.isPlaying
                    ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                    : 'bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-[0_0_28px_rgba(245,158,11,0.28)]'
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
                className="flex h-13 w-13 items-center justify-center rounded-2xl border border-white/10 bg-[#181B23] text-zinc-300 hover:bg-white/10 hover:text-white active:scale-95 transition"
                title="Stop & Reset"
                aria-label="Stop and reset"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#181B23] px-5 py-3 text-center text-sm text-zinc-300">
              {timeline.isPlaying
                ? 'Synced playback active — controlled by Host'
                : 'Waiting for Host to start metronome'}
            </div>
          )}
        </div>

        {/* Time Signature, Subdivision & Count-In Strip */}
        {isHost && (
          <div className="mt-7 pt-5 border-t border-white/[0.06] space-y-4">
            {/* Time Signature Row */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">Time Signature</span>
                <button
                  type="button"
                  onClick={() => setShowCustomTs((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
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
                      className={`h-10 rounded-lg font-mono-tabular text-xs font-semibold transition ${
                        selected
                          ? 'bg-amber-500 text-zinc-950'
                          : 'bg-[#181B23] text-zinc-300 hover:bg-white/10'
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
                  <span className="text-xs text-zinc-500">Accent Grouping:</span>
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
                        className={`rounded-lg px-2.5 py-1.5 font-mono-tabular text-xs transition ${
                          isSame
                            ? 'bg-white/15 text-amber-300 font-semibold'
                            : 'bg-[#181B23] text-zinc-400 hover:text-zinc-200'
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
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#181B23] p-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
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
                      className="w-16 rounded-lg border border-white/10 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-sm text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
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
                      className="rounded-lg border border-white/10 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-sm text-white"
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
                  <span className="text-xs font-medium text-zinc-400">Subdivision</span>
                  <button
                    type="button"
                    onClick={onOpenSoundTab}
                    className="text-xs text-zinc-400 hover:text-amber-300"
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
                      className={`h-10 rounded-lg px-2 font-mono-tabular text-xs font-medium transition whitespace-nowrap truncate ${
                        session.subdivision === sub.id
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'bg-[#181B23] text-zinc-300 hover:bg-white/10'
                      }`}
                      title={sub.label}
                    >
                      {sub.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-400">Count-In Bars</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {([0, 1, 2, 4, 8] as CountInBars[]).map((bars) => (
                    <button
                      key={bars}
                      type="button"
                      onClick={() => onUpdate({ countInBars: bars })}
                      className={`h-10 rounded-lg font-mono-tabular text-xs font-medium transition ${
                        session.countInBars === bars
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'bg-[#181B23] text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {bars === 0 ? 'Off' : `${bars}b`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vocal Counting & Click Layer Row */}
            <div className="pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-9">
                <div className="mb-2 text-xs font-medium text-zinc-400">Vocal Beat Counting</div>
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
                        className={`studio-keycap h-10 rounded-lg px-2 text-xs font-medium transition whitespace-nowrap truncate ${
                          active
                            ? 'bg-amber-500 text-zinc-950 font-semibold'
                            : 'bg-[#181B23] text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-3">
                <div className="mb-2 text-xs font-medium text-zinc-400">Click Pulse</div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      clickProfile: {
                        clickEnabled: !(session.clickProfile.clickEnabled ?? true),
                      },
                    })
                  }
                  className={`studio-keycap w-full h-10 rounded-lg text-xs font-semibold transition ${
                    (session.clickProfile.clickEnabled ?? true)
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'bg-[#181B23] text-zinc-500 border border-white/5'
                  }`}
                >
                  {(session.clickProfile.clickEnabled ?? true) ? 'Click: On' : 'Click: Off'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Active Setlist Song Cue Card */}
      {session.setlist.length > 0 && (
        <section className="hc-surface rounded-2xl border border-white/[0.08] bg-[#12141A] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={!canControlSetlist || session.activeSongIndex <= 0}
              onClick={() => onSelectSong(session.activeSongIndex - 1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#181B23] text-zinc-200 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
              aria-label="Previous song"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Set {String(session.activeSongIndex + 1).padStart(2, '0')} /{' '}
                {String(session.setlist.length).padStart(2, '0')}
                {activeSection ? ` · ${activeSection.label}` : ''}
              </div>
              <div className="mt-0.5 font-display text-lg font-bold text-white truncate">
                {activeSong ? activeSong.songName : 'No song selected'}
              </div>
              <div className="mt-0.5 text-xs text-zinc-400 truncate">
                {nextSong ? (
                  <span>
                    Next: <strong className="text-zinc-200">{nextSong.songName}</strong> ·{' '}
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
                <div className="mt-1 text-[11px] text-amber-300/85 truncate">
                  {activeSong.notes}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canControlSetlist || session.activeSongIndex >= session.setlist.length - 1}
              onClick={() => onSelectSong(session.activeSongIndex + 1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#181B23] text-zinc-200 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
              aria-label="Next song"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      )}

      {/* Quick Presets Strip */}
      {isHost && presets.length > 0 && (
        <section className="hc-surface studio-panel rounded-2xl border border-white/[0.08] p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-medium text-zinc-400">Quick Presets</h2>
          </div>
          <div className="scroll-touch flex items-center gap-2 overflow-x-auto pb-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className="studio-keycap shrink-0 rounded-xl border border-white/10 bg-[#181B23] px-3.5 py-2.5 text-left hover:border-amber-500/40 hover:bg-white/[0.06] transition"
              >
                <div className="text-xs font-semibold text-white whitespace-nowrap">
                  {preset.name}
                </div>
                <div className="mt-0.5 font-mono-tabular text-[11px] text-zinc-400 whitespace-nowrap">
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
