import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X, Zap } from 'lucide-react';
import React from 'react';
import { SUBDIVISIONS } from '../constants/metronomeData';
import {
  AccessibilitySettings,
  ConnectionQuality,
  MetronomeSessionState,
  RemotePermissions,
} from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';
import { BeatVisualizer } from './BeatVisualizer';
import { ConnectionBadge } from './ConnectionBadge';
import { StageFlashBackdrop } from './StageFlashBackdrop';
import { SyncBeatLogo } from './SyncBeatLogo';
import { VocalCountdown } from './VocalCountdown';

interface PerformanceModeProps {
  session: MetronomeSessionState;
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  isWireless: boolean;
  isHost: boolean;
  permissions: RemotePermissions;
  connectionQuality: ConnectionQuality;
  latencyMs: number;
  reconnecting: boolean;
  accessibility: AccessibilitySettings;
  localSelfMuted: boolean;
  audioSuspended: boolean;
  onToggleLocalMute: () => void;
  onUnlockAudio: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSelectSong: (index: number) => void;
  onClose: () => void;
  onToggleStageFlash: () => void;
}

export const PerformanceMode: React.FC<PerformanceModeProps> = React.memo(({
  session,
  timeline,
  getTimelineSnapshot,
  isWireless,
  isHost,
  permissions,
  connectionQuality,
  latencyMs,
  reconnecting,
  accessibility,
  localSelfMuted,
  audioSuspended,
  onToggleLocalMute,
  onUnlockAudio,
  onPlay,
  onPause,
  onSelectSong,
  onClose,
  onToggleStageFlash,
}) => {
  const canControlTransport = isHost || permissions.playStop;
  const canControlSetlist = isHost || permissions.setlistNav;

  const activeSong = session.setlist[session.activeSongIndex] ?? null;
  const nextSong =
    session.activeSongIndex + 1 < session.setlist.length
      ? session.setlist[session.activeSongIndex + 1]
      : null;

  const subMeta = SUBDIVISIONS.find((s) => s.id === session.subdivision);

  const stageFlashEnabled = Boolean(accessibility.stageFlash);

  return (
    <div className="fixed inset-0 h-dvh z-50 flex flex-col justify-between bg-[#F4F5F8] text-slate-900 dark:bg-[#050608] dark:text-white p-4 sm:p-8 pt-safe pb-safe select-none overflow-hidden transition-colors duration-200">
      <StageFlashBackdrop
        enabled={stageFlashEnabled}
        accentPattern={session.accentPattern}
        timeline={timeline}
        getTimelineSnapshot={getTimelineSnapshot}
        reducedMotion={accessibility.reducedMotion}
        theme={accessibility.theme ?? 'dark'}
        scope="fullscreen"
      />
      {/* Minimal Top Bar */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <SyncBeatLogo variant="mark" className="w-7 h-7" />
          <span className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-zinc-400 truncate">
            Stage View
          </span>
          <ConnectionBadge
            quality={connectionQuality}
            latencyMs={latencyMs}
            isWireless={isWireless}
            reconnecting={reconnecting}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleStageFlash}
            aria-pressed={stageFlashEnabled}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold min-h-[44px] active:scale-95 transition whitespace-nowrap shrink-0 ${
              stageFlashEnabled
                ? 'border-amber-400 bg-amber-500 text-zinc-950'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10'
            }`}
            aria-label={stageFlashEnabled ? 'Disable Flash Mode' : 'Enable Flash Mode'}
          >
            <Zap className={`w-4 h-4 ${stageFlashEnabled ? 'fill-current' : ''}`} />
            <span>Flash</span>
          </button>

          <button
            type="button"
            onClick={onToggleLocalMute}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition active:scale-95 ${
              localSelfMuted
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10'
            }`}
            aria-label={localSelfMuted ? 'Unmute local audio' : 'Mute local audio'}
          >
            {localSelfMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10 min-h-[44px] active:scale-95 transition"
          >
            <X className="w-4 h-4" />
            <span>Exit Stage</span>
          </button>
        </div>
      </div>

      {/* Audio Unlock Bar for Mobile Stage Viewers */}
      {audioSuspended && timeline.isPlaying && (
        <button
          type="button"
          onClick={onUnlockAudio}
          className="relative z-10 mx-auto mt-2 flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200"
        >
          <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Tap to enable stage audio</span>
        </button>
      )}

      {/* Center Stage: Huge BPM & Beat Orbs */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto py-2">
        <div className="font-display font-extrabold leading-none tracking-tight tabular-nums text-[clamp(4.75rem,18vw,11.5rem)] text-slate-900 dark:text-white">
          {Number.isInteger(session.bpm) ? session.bpm : session.bpm.toFixed(1)}
        </div>

        <div className="mt-2 flex items-center gap-3 font-mono-tabular text-lg sm:text-2xl font-semibold text-slate-500 dark:text-zinc-400">
          <span>
            {session.timeSignature.numerator}/{session.timeSignature.denominator}
          </span>
          <span aria-hidden="true">·</span>
          <span>{subMeta?.shortLabel ?? session.subdivision}</span>
        </div>

        <div className="mt-6 sm:mt-8 w-full max-w-3xl">
          <BeatVisualizer
            timeSignature={session.timeSignature}
            accentPattern={session.accentPattern}
            subdivision={session.subdivision}
            timeline={timeline}
            getTimelineSnapshot={getTimelineSnapshot}
            canEditAccents={false}
            visualFlash={accessibility.visualFlash}
            large={true}
          />
          <VocalCountdown
            variant="cue"
            profile={session.clickProfile}
            bpm={session.bpm}
            beatsPerBar={session.timeSignature.numerator}
            subdivision={session.subdivision}
            isHost={isHost}
            timeline={timeline}
            onUpdateClickProfile={() => undefined}
            onPreviewVocalCount={() => undefined}
          />
        </div>
      </div>

      {/* Bottom Stage Cue + Minimal Transport */}
      <div className="relative z-10 mx-auto w-full max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-white/10 pt-4">
        <div className="text-center sm:text-left min-w-0 max-w-full">
          <div className="font-display text-xl sm:text-3xl font-bold text-slate-900 dark:text-white truncate">
            {activeSong ? activeSong.songName : session.name}
          </div>
          <div className="mt-0.5 text-xs sm:text-sm font-medium text-slate-500 dark:text-zinc-400 truncate">
            {nextSong ? (
              <span>
                NEXT: <strong className="text-amber-600 dark:text-amber-400">{nextSong.songName}</strong> ·{' '}
                <span className="font-mono-tabular">{nextSong.bpm} BPM</span>
              </span>
            ) : (
              <span>End of Setlist</span>
            )}
          </div>
          {activeSong?.notes && (
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300/85 truncate">
              {activeSong.notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canControlSetlist && session.setlist.length > 0 && (
            <button
              type="button"
              disabled={session.activeSongIndex <= 0}
              onClick={() => onSelectSong(session.activeSongIndex - 1)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 disabled:opacity-30"
              aria-label="Previous song"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {canControlTransport && (
            <button
              type="button"
              onClick={timeline.isPlaying ? onPause : onPlay}
              className={`flex h-14 px-8 items-center justify-center gap-2 rounded-2xl font-display text-base font-bold ${
                timeline.isPlaying
                  ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-950'
                  : 'bg-amber-500 text-zinc-950'
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
          )}

          {canControlSetlist && session.setlist.length > 0 && (
            <button
              type="button"
              disabled={session.activeSongIndex >= session.setlist.length - 1}
              onClick={() => onSelectSong(session.activeSongIndex + 1)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 disabled:opacity-30"
              aria-label="Next song"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
PerformanceMode.displayName = 'PerformanceMode';
