import {
  Activity,
  ListMusic,
  LogIn,
  LogOut,
  Maximize2,
  Radio,
  Sliders,
  WifiOff,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ConnectionBadge } from './components/ConnectionBadge';
import { JoinPromptModal } from './components/JoinPromptModal';
import { MetronomeStage } from './components/MetronomeStage';
import { PerformanceMode } from './components/PerformanceMode';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SessionPanel } from './components/SessionPanel';
import { SetlistManager } from './components/SetlistManager';
import { SoundAndSettings } from './components/SoundAndSettings';
import { SyncBeatLogo } from './components/SyncBeatLogo';
import { useAuth } from './contexts/AuthContext';
import { useMetronomeSync } from './hooks/useMetronomeSync';
import { useWakeLock } from './hooks/useWakeLock';
import { AccessibilitySettings, ClickProfile } from './types/metronome';

type AppTab = 'metronome' | 'setlist' | 'sound' | 'session';
const ACCESSIBILITY_STORAGE_KEY = 'syncbeat:accessibility:v1';

const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  largeText: false,
  highContrast: false,
  reducedMotion: false,
  hapticBeat: false,
  hapticAccentOnly: false,
  visualFlash: true,
};

function readInitialAccessibility(): AccessibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_ACCESSIBILITY;
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESSIBILITY;
    return { ...DEFAULT_ACCESSIBILITY, ...(JSON.parse(raw) as Partial<AccessibilitySettings>) };
  } catch {
    return DEFAULT_ACCESSIBILITY;
  }
}

function extractJoinCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/join\/([A-Za-z0-9]{4,8})\/?$/i);
  if (match) return match[1].toUpperCase();
  const params = new URLSearchParams(window.location.search);
  const qCode = params.get('join');
  return qCode ? qCode.toUpperCase().trim() : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('metronome');
  const [performanceMode, setPerformanceMode] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() =>
    extractJoinCodeFromUrl()
  );
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(readInitialAccessibility);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(accessibility));
    } catch {
      // ignore
    }
  }, [accessibility]);

  const auth = useAuth();
  const sync = useMetronomeSync(accessibility, auth.idToken);

  // Keep screen awake during active metronome playback or Performance Mode
  useWakeLock(sync.timeline.isPlaying || performanceMode);

  useEffect(() => {
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Keyboard shortcuts for desktop rehearsal control
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (sync.isHost || sync.permissions.playStop) {
          if (sync.timeline.isPlaying) sync.pause();
          else sync.play();
        }
      } else if (e.key === 's' || e.key === 'S') {
        if (sync.isHost || sync.permissions.playStop) sync.stop();
      } else if (e.key === 't' || e.key === 'T') {
        if (sync.isHost || sync.permissions.bpm) sync.registerTap();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (sync.isHost || sync.permissions.bpm) {
          sync.updateMetronome({ bpm: sync.session.bpm + 1 });
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (sync.isHost || sync.permissions.bpm) {
          sync.updateMetronome({ bpm: sync.session.bpm - 1 });
        }
      } else if (e.key === 'ArrowRight') {
        if (
          (sync.isHost || sync.permissions.setlistNav) &&
          sync.session.activeSongIndex < sync.session.setlist.length - 1
        ) {
          sync.selectSong(sync.session.activeSongIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if ((sync.isHost || sync.permissions.setlistNav) && sync.session.activeSongIndex > 0) {
          sync.selectSong(sync.session.activeSongIndex - 1);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        setPerformanceMode((v) => !v);
      } else if (e.key === 'Escape' && performanceMode) {
        setPerformanceMode(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [performanceMode, sync]);

  const dismissJoinPrompt = () => {
    setPendingJoinCode(null);
    if (window.location.pathname.startsWith('/join/')) {
      window.history.replaceState({}, '', '/');
    }
  };

  const openPerformanceMode = useCallback(() => setPerformanceMode(true), []);
  const closePerformanceMode = useCallback(() => setPerformanceMode(false), []);
  const openSoundTab = useCallback(() => setActiveTab('sound'), []);
  const handleUpdateClickProfile = useCallback(
    (patch: Partial<ClickProfile>) => sync.updateMetronome({ clickProfile: patch }),
    [sync]
  );
  const handleUpdateAccessibility = useCallback(
    (patch: Partial<AccessibilitySettings>) =>
      setAccessibility((prev) => ({ ...prev, ...patch })),
    []
  );

  const navItems: Array<{ id: AppTab; label: string; Icon: typeof Activity }> = [
    { id: 'metronome', label: 'Metronome', Icon: Activity },
    { id: 'setlist', label: 'Setlist', Icon: ListMusic },
    { id: 'sound', label: 'Sound', Icon: Sliders },
    { id: 'session', label: 'Session', Icon: Radio },
  ];

  return (
    <div
      className={`min-h-dvh bg-[#0A0B0E] text-[#F4F5F7] flex flex-col ${
        accessibility.highContrast ? 'high-contrast' : ''
      } ${accessibility.reducedMotion ? 'reduced-motion' : ''}`}
    >
      {/* Top Bar (Strictly 3 zones: Brand — Nav Links — Primary Status/Action) */}
      <header className="sticky top-0 z-30 h-14 pt-safe border-b border-white/[0.08] bg-[#0A0B0E]/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 sm:gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('metronome')}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
          >
            <SyncBeatLogo variant="mark" className="w-8 h-8" />
            <span className="font-display text-lg font-extrabold tracking-tight text-white">
              SyncBeat
            </span>
          </button>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-amber-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Connection Status + Account + Primary Stage / Install */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('session')}
              className="rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
              title="Open Session & Sync Details"
            >
              <ConnectionBadge
                quality={sync.connectionQuality}
                latencyMs={sync.latencyMs}
                isWireless={sync.isWireless}
                reconnecting={sync.reconnecting}
              />
            </button>
            <PWAInstallButton />
            {!auth.loading &&
              (auth.user ? (
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181B23] px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                  title={`Signed in as ${auth.user.email ?? 'Musician'} — Click to sign out`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-300">
                    {(auth.user.displayName || auth.user.email || 'M').slice(0, 1).toUpperCase()}
                  </span>
                  <LogOut className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void auth.signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181B23] px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                  title="Sign in with Google to save your sets across devices"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPerformanceMode(true)}
              className="hidden sm:inline-flex md:hidden items-center gap-1.5 rounded-lg bg-[#181B23] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Stage</span>
            </button>
          </div>
        </div>
      </header>

      {/* Network / Session Alert Banners */}
      {(!isBrowserOnline || auth.authError || sync.statusBanner || (sync.isWireless && sync.connectionQuality === 'offline')) && (
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pt-3 space-y-2">
          {!isBrowserOnline && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Offline Mode — Local metronome, click synthesis, and cached setlists remain active.</span>
              </div>
            </div>
          )}

          {auth.authError && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
              <span>Sign-in notice: {auth.authError}</span>
              <button
                type="button"
                onClick={auth.clearAuthError}
                className="p-1 text-rose-300 hover:text-white"
                aria-label="Dismiss sign-in error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {sync.isWireless && sync.connectionQuality === 'offline' && isBrowserOnline && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
              <span>
                CONNECTION LOST — Attempting to reconnect and resynchronize with session{' '}
                <strong className="font-mono-tabular">{sync.session.sessionId}</strong>...
              </span>
              <button
                type="button"
                onClick={sync.forceResync}
                className="rounded-lg bg-white/10 px-2.5 py-1 font-semibold text-white hover:bg-white/20 shrink-0"
              >
                Retry Now
              </button>
            </div>
          )}

          {sync.statusBanner && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#181B23] px-4 py-2.5 text-xs text-zinc-200">
              <span>{sync.statusBanner}</span>
              <button
                type="button"
                onClick={sync.dismissBanner}
                className="p-1 text-zinc-400 hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        {activeTab === 'metronome' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 xl:col-span-8">
              <MetronomeStage
                session={sync.session}
                timeline={sync.timeline}
                isHost={sync.isHost}
                permissions={sync.permissions}
                presets={sync.presets}
                accessibility={accessibility}
                localSelfMuted={sync.localSelfMuted}
                audioSuspended={sync.audioSuspended}
                tapCount={sync.tapCount}
                onToggleLocalMute={sync.toggleLocalSelfMute}
                onUnlockAudio={() => void sync.unlockAudio()}
                onPlay={sync.play}
                onPause={sync.pause}
                onStop={sync.stop}
                onRestart={sync.restart}
                onTap={sync.registerTap}
                onUpdate={sync.updateMetronome}
                onSelectSong={sync.selectSong}
                onApplyPreset={sync.applyPreset}
                onOpenPerformanceMode={openPerformanceMode}
                onOpenSoundTab={openSoundTab}
              />
            </div>

            <div className="lg:col-span-5 xl:col-span-4">
              <SessionPanel
                session={sync.session}
                isWireless={sync.isWireless}
                isHost={sync.isHost}
                me={sync.me}
                connectionQuality={sync.connectionQuality}
                latencyMs={sync.latencyMs}
                reconnecting={sync.reconnecting}
                onCreateSession={sync.createSession}
                onJoinSession={sync.joinSession}
                onLeaveSession={sync.leaveSession}
                onEndSession={sync.endSession}
                onForceResync={sync.forceResync}
                onRegenerateCode={sync.regenerateCode}
                onUpdateSessionMeta={sync.updateMetronome}
                onControlParticipant={sync.controlParticipant}
                compactSidebar={true}
              />
            </div>
          </div>
        )}

        {activeTab === 'setlist' && (
          <div className="max-w-4xl mx-auto">
            <SetlistManager
              session={sync.session}
              setlists={sync.setlists}
              isHost={sync.isHost}
              permissions={sync.permissions}
              onSaveSetlists={sync.saveSetlistsLibrary}
              onLoadSetlist={sync.loadSetlistToSession}
              onSelectSong={sync.selectSong}
              onPlay={sync.play}
            />
          </div>
        )}

        {activeTab === 'sound' && (
          <div className="max-w-4xl mx-auto">
            <SoundAndSettings
              session={sync.session}
              timeline={sync.timeline}
              isHost={sync.isHost}
              presets={sync.presets}
              accessibility={accessibility}
              deviceOffsetMs={sync.deviceOffsetMs}
              onUpdateDeviceOffsetMs={sync.setDeviceOffsetMs}
              onUpdateClickProfile={handleUpdateClickProfile}
              onPreviewClick={sync.previewClick}
              onPreviewVocalCount={sync.previewVocalCount}
              onSavePresets={sync.savePresetsLibrary}
              onApplyPreset={sync.applyPreset}
              onUpdateAccessibility={handleUpdateAccessibility}
            />
          </div>
        )}

        {activeTab === 'session' && (
          <div className="max-w-4xl mx-auto">
            <SessionPanel
              session={sync.session}
              isWireless={sync.isWireless}
              isHost={sync.isHost}
              me={sync.me}
              connectionQuality={sync.connectionQuality}
              latencyMs={sync.latencyMs}
              reconnecting={sync.reconnecting}
              onCreateSession={sync.createSession}
              onJoinSession={sync.joinSession}
              onLeaveSession={sync.leaveSession}
              onEndSession={sync.endSession}
              onForceResync={sync.forceResync}
              onRegenerateCode={sync.regenerateCode}
              onUpdateSessionMeta={sync.updateMetronome}
              onControlParticipant={sync.controlParticipant}
              compactSidebar={false}
            />
          </div>
        )}
      </main>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar (56px-64px, <= 15% mobile sticky cap) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.08] bg-[#0A0B0E]/95 backdrop-blur-md pb-safe"
        aria-label="Primary navigation"
      >
        <div className="grid grid-cols-4 h-15">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors min-h-[44px] ${
                  active ? 'text-amber-400' : 'text-zinc-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.id === 'session' && sync.isWireless && (
                  <span className="absolute top-2 right-1/4 h-2 w-2 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Fullscreen Performance Mode */}
      {performanceMode && (
        <PerformanceMode
          session={sync.session}
          timeline={sync.timeline}
          isWireless={sync.isWireless}
          isHost={sync.isHost}
          permissions={sync.permissions}
          connectionQuality={sync.connectionQuality}
          latencyMs={sync.latencyMs}
          reconnecting={sync.reconnecting}
          accessibility={accessibility}
          localSelfMuted={sync.localSelfMuted}
          audioSuspended={sync.audioSuspended}
          onToggleLocalMute={sync.toggleLocalSelfMute}
          onUnlockAudio={() => void sync.unlockAudio()}
          onPlay={sync.play}
          onPause={sync.pause}
          onSelectSong={sync.selectSong}
          onClose={closePerformanceMode}
        />
      )}

      {/* QR / Direct Link Join Prompt */}
      {pendingJoinCode && !sync.isWireless && (
        <JoinPromptModal
          code={pendingJoinCode}
          onJoin={sync.joinSession}
          onDismiss={dismissJoinPrompt}
        />
      )}
    </div>
  );
}
