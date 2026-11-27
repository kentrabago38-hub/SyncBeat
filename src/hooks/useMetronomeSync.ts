import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import {
  buildAccentPattern,
  DEFAULT_CLICK_PROFILE,
  DEFAULT_PRESETS,
  DEFAULT_SETLISTS,
} from '../constants/metronomeData';
import {
  AccessibilitySettings,
  ClickProfile,
  ClickSoundId,
  ConnectionQuality,
  CountInBars,
  MetronomePreset,
  MetronomeSessionState,
  MusicianRole,
  RemotePermissions,
  Setlist,
  SetlistItem,
  SubdivisionType,
  TimeSignature,
} from '../types/metronome';
import { evaluateTimeline, TimelineSnapshot } from '../utils/timeline';
import { apiUrl, getWsUrl } from '../utils/syncConfig';

interface AuthCredentials {
  sessionId: string;
  participantId: string;
  token: string;
}

interface ClockSample {
  rtt: number;
  offset: number;
  recordedAt: number;
}

const LOCAL_HOST_ID = 'local-musician';
const STORAGE_KEYS = {
  presets: 'syncbeat:presets:v1',
  setlists: 'syncbeat:setlists:v1',
  deviceOffsetMs: 'syncbeat:deviceOffsetMs:v1',
  sessionConfig: 'syncbeat:sessionConfig:v1',
};

interface PersistedSessionConfig {
  name?: string;
  hostName?: string;
  hostRole?: MusicianRole;
  bpm?: number;
  timeSignature?: TimeSignature;
  accentPattern?: MetronomeSessionState['accentPattern'];
  subdivision?: SubdivisionType;
  clickProfile?: Partial<ClickProfile>;
  countInBars?: CountInBars;
  activeSetlistId?: string | null;
  activeSongIndex?: number;
  setlist?: SetlistItem[];
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota / private mode errors
  }
}

function extractSessionConfig(session: MetronomeSessionState): PersistedSessionConfig {
  return {
    name: session.name,
    hostName: session.hostName,
    hostRole: session.hostRole,
    bpm: session.bpm,
    timeSignature: session.timeSignature,
    accentPattern: session.accentPattern,
    subdivision: session.subdivision,
    clickProfile: session.clickProfile,
    countInBars: session.countInBars,
    activeSetlistId: session.activeSetlistId,
    activeSongIndex: session.activeSongIndex,
    setlist: session.setlist,
  };
}

function createInitialLocalState(): MetronomeSessionState {
  const now = Date.now();
  const initialSong = DEFAULT_SETLISTS[0].items[0];
  const saved = readStoredJson<PersistedSessionConfig | null>(STORAGE_KEYS.sessionConfig, null);

  const savedSetlist =
    saved && Array.isArray(saved.setlist) ? saved.setlist.slice(0, 100) : [...DEFAULT_SETLISTS[0].items];
  const savedTs: TimeSignature =
    saved?.timeSignature &&
    typeof saved.timeSignature.numerator === 'number' &&
    typeof saved.timeSignature.denominator === 'number'
      ? {
          numerator: Math.max(1, Math.min(16, Math.round(saved.timeSignature.numerator))),
          denominator: ([2, 4, 8, 16].includes(saved.timeSignature.denominator)
            ? saved.timeSignature.denominator
            : 4) as 2 | 4 | 8 | 16,
          grouping: Array.isArray(saved.timeSignature.grouping)
            ? saved.timeSignature.grouping
            : undefined,
        }
      : { ...initialSong.timeSignature };

  const savedAccent =
    saved && Array.isArray(saved.accentPattern) && saved.accentPattern.length === savedTs.numerator
      ? saved.accentPattern
      : buildAccentPattern(savedTs);

  const savedBpm =
    saved && typeof saved.bpm === 'number' && Number.isFinite(saved.bpm)
      ? Math.round(Math.min(300, Math.max(20, saved.bpm)) * 10) / 10
      : initialSong.bpm;

  const clampedSongIdx =
    savedSetlist.length > 0 && typeof saved?.activeSongIndex === 'number'
      ? Math.max(0, Math.min(savedSetlist.length - 1, Math.round(saved.activeSongIndex)))
      : 0;

  const hostName =
    saved && typeof saved.hostName === 'string' && saved.hostName.trim()
      ? saved.hostName.trim()
      : 'You';
  const hostRole: MusicianRole = saved?.hostRole ?? 'Keyboard';

  return {
    sessionId: 'LOCAL',
    name: saved && typeof saved.name === 'string' && saved.name.trim() ? saved.name : 'Solo Practice',
    hostId: LOCAL_HOST_ID,
    hostName,
    hostRole,
    isLocked: false,
    bpm: savedBpm,
    timeSignature: savedTs,
    accentPattern: [...savedAccent],
    subdivision: saved?.subdivision ?? initialSong.subdivision,
    clickProfile: {
      ...DEFAULT_CLICK_PROFILE,
      normalSound: initialSong.clickSound,
      ...(saved?.clickProfile ?? {}),
    },
    countInBars:
      saved?.countInBars !== undefined && [0, 1, 2, 4, 8].includes(saved.countInBars)
        ? saved.countInBars
        : initialSong.countInBars,
    playback: {
      isPlaying: false,
      anchorServerMs: now,
      anchorTotalBeats: 0,
      sequenceId: 1,
      activeSectionIndex: 0,
    },
    activeSetlistId:
      saved?.activeSetlistId !== undefined ? saved.activeSetlistId : DEFAULT_SETLISTS[0].id,
    activeSongIndex: clampedSongIdx,
    setlist: savedSetlist,
    participants: [
      {
        id: LOCAL_HOST_ID,
        name: hostName,
        role: hostRole,
        isHost: true,
        isMuted: false,
        status: 'synced',
        latencyMs: 0,
        permissions: { playStop: true, bpm: true, setlistNav: true },
        joinedAt: now,
      },
    ],
    createdAt: now,
    lastActivityAt: now,
  };
}

export function useMetronomeSync(
  accessibility: AccessibilitySettings,
  idToken: string | null = null
) {
  const [localSession, setLocalSession] = useState<MetronomeSessionState>(createInitialLocalState);
  const [remoteSession, setRemoteSession] = useState<MetronomeSessionState | null>(null);
  const [credentials, setCredentials] = useState<AuthCredentials | null>(null);

  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('synced');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const [localSelfMuted, setLocalSelfMuted] = useState(false);
  const [localMasterVolume, setLocalMasterVolume] = useState<number | null>(null);
  const [audioSuspended, setAudioSuspended] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [tapBpmHistory, setTapBpmHistory] = useState<number[]>([]);
  const [deviceOffsetMs, setDeviceOffsetMsState] = useState<number>(() => {
    const val = readStoredJson<number>(STORAGE_KEYS.deviceOffsetMs, 0);
    return typeof val === 'number' && Number.isFinite(val) ? val : 0;
  });

  const [presets, setPresets] = useState<MetronomePreset[]>(() =>
    readStoredJson<MetronomePreset[]>(STORAGE_KEYS.presets, DEFAULT_PRESETS)
  );
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    readStoredJson<Setlist[]>(STORAGE_KEYS.setlists, DEFAULT_SETLISTS)
  );

  const wsRef = useRef<WebSocket | null>(null);
  const credsRef = useRef<AuthCredentials | null>(null);
  const transportModeRef = useRef<'ws' | 'http'>('ws');
  const httpPollTimerRef = useRef<number | null>(null);
  const httpInFlightRef = useRef<boolean>(false);
  const httpAbortRef = useRef<AbortController | null>(null);
  const httpSyncNowRef = useRef<(() => void) | null>(null);
  const burstTimersRef = useRef<number[]>([]);
  const clockSamplesRef = useRef<ClockSample[]>([]);
  const localClockOffsetRef = useRef<number>(Date.now() - performance.now());
  const serverOffsetRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const lastMessageAtRef = useRef<number>(0);
  const computedQualityRef = useRef<ConnectionQuality>('synced');
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const manualDisconnectRef = useRef<boolean>(false);
  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);
  const localAutomationTimerRef = useRef<number | null>(null);

  const isWireless = Boolean(credentials && remoteSession);
  const baseSession = isWireless && remoteSession ? remoteSession : localSession;
  const myParticipantId = credentials?.participantId ?? LOCAL_HOST_ID;

  const me = useMemo(
    () => baseSession.participants.find((p) => p.id === myParticipantId) ?? null,
    [baseSession.participants, myParticipantId]
  );

  const isHost = !isWireless || baseSession.hostId === myParticipantId;

  const activeSession = useMemo(() => {
    if (isWireless && !isHost && localMasterVolume !== null) {
      return {
        ...baseSession,
        clickProfile: {
          ...baseSession.clickProfile,
          masterVolume: localMasterVolume,
        },
      };
    }
    return baseSession;
  }, [baseSession, isHost, isWireless, localMasterVolume]);

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const isWirelessRef = useRef(isWireless);
  isWirelessRef.current = isWireless;

  const getTimelineSnapshot = useCallback((): TimelineSnapshot => {
    const offset = isWirelessRef.current ? serverOffsetRef.current : localClockOffsetRef.current;
    return evaluateTimeline(activeSessionRef.current, offset);
  }, []);

  const permissions: RemotePermissions = useMemo(() => {
    if (isHost) return { playStop: true, bpm: true, setlistNav: true };
    return me?.permissions ?? { playStop: false, bpm: false, setlistNav: false };
  }, [isHost, me]);

  // Trigger mobile haptics cleanly on UI beat-edge transitions (keeps audio scheduler 100% timer-free)
  const lastHapticBeatRef = useRef<number>(-1);

  useEffect(() => {
    audioEngine.setLocalMuted(Boolean(me?.isMuted) || localSelfMuted);
  }, [localSelfMuted, me?.isMuted]);

  useEffect(() => {
    audioEngine.setDeviceOffsetMs(deviceOffsetMs);
    try {
      window.localStorage.setItem(STORAGE_KEYS.deviceOffsetMs, JSON.stringify(deviceOffsetMs));
    } catch {
      // ignore storage quota errors
    }
  }, [deviceOffsetMs]);

  const cloudConfigTimerRef = useRef<number | null>(null);
  const lastCloudHydratedTokenRef = useRef<string | null>(null);

  // Persist session configuration (BPM, time signature, accents, click/vocal profile, setlist)
  useEffect(() => {
    const source = isWireless && isHost && remoteSession ? remoteSession : !isWireless ? localSession : null;
    if (!source) return;
    const cfg = extractSessionConfig(source);
    writeStoredJson(STORAGE_KEYS.sessionConfig, cfg);

    if (idToken) {
      if (cloudConfigTimerRef.current) {
        window.clearTimeout(cloudConfigTimerRef.current);
      }
      cloudConfigTimerRef.current = window.setTimeout(() => {
        void fetch(apiUrl('/api/user/session-config'), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ config: { ...cfg, updatedAt: Date.now() } }),
        }).catch(() => {
          // keep local storage intact when offline
        });
      }, 900);
    }
    return () => {
      if (cloudConfigTimerRef.current) {
        window.clearTimeout(cloudConfigTimerRef.current);
      }
    };
  }, [idToken, isHost, isWireless, localSession, remoteSession]);

  // Sync user's saved library and session configuration when signed in
  useEffect(() => {
    if (!idToken || lastCloudHydratedTokenRef.current === idToken) return;
    lastCloudHydratedTokenRef.current = idToken;
    let active = true;

    fetch(apiUrl('/api/user/sync'), {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            library?: { presets: MetronomePreset[]; setlists: Setlist[]; updatedAt: number } | null;
            sessionConfig?: PersistedSessionConfig | null;
          } | null
        ) => {
          if (!active || !data) return;
          if (data.library) {
            if (Array.isArray(data.library.presets) && data.library.presets.length > 0) {
              setPresets(data.library.presets);
              writeStoredJson(STORAGE_KEYS.presets, data.library.presets);
            }
            if (Array.isArray(data.library.setlists) && data.library.setlists.length > 0) {
              setSetlists(data.library.setlists);
              writeStoredJson(STORAGE_KEYS.setlists, data.library.setlists);
            }
          }
          if (data.sessionConfig && !isWireless) {
            const cfg = data.sessionConfig;
            setLocalSession((prev) => ({
              ...prev,
              name: typeof cfg.name === 'string' && cfg.name.trim() ? cfg.name : prev.name,
              hostName:
                typeof cfg.hostName === 'string' && cfg.hostName.trim()
                  ? cfg.hostName
                  : prev.hostName,
              hostRole: cfg.hostRole ?? prev.hostRole,
              bpm: typeof cfg.bpm === 'number' ? cfg.bpm : prev.bpm,
              timeSignature: cfg.timeSignature ?? prev.timeSignature,
              accentPattern:
                Array.isArray(cfg.accentPattern) && cfg.accentPattern.length > 0
                  ? cfg.accentPattern
                  : prev.accentPattern,
              subdivision: cfg.subdivision ?? prev.subdivision,
              clickProfile: cfg.clickProfile
                ? { ...prev.clickProfile, ...cfg.clickProfile }
                : prev.clickProfile,
              countInBars: cfg.countInBars ?? prev.countInBars,
              activeSetlistId:
                cfg.activeSetlistId !== undefined ? cfg.activeSetlistId : prev.activeSetlistId,
              activeSongIndex:
                typeof cfg.activeSongIndex === 'number'
                  ? cfg.activeSongIndex
                  : prev.activeSongIndex,
              setlist: Array.isArray(cfg.setlist) ? cfg.setlist : prev.setlist,
            }));
          }
        }
      )
      .catch(() => {
        // fallback cleanly to local cache
      });

    return () => {
      active = false;
    };
  }, [idToken, isWireless]);

  // Sync audio engine whenever session state or offset updates
  useEffect(() => {
    const offset = isWireless ? serverOffsetRef.current : localClockOffsetRef.current;
    audioEngine.updateSyncState(activeSession, offset);
    setAudioSuspended(activeSession.playback.isPlaying && audioEngine.isSuspended());
  }, [activeSession, isWireless]);

  // Load presets & setlists from backend (preferring whichever copy has newer updatedAt edits)
  useEffect(() => {
    let mounted = true;
    const maxUpdated = (arr: Array<{ updatedAt?: number }>) =>
      arr.reduce((m, item) => Math.max(m, item.updatedAt ?? 0), 0);

    fetch(apiUrl('/api/library'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { presets?: MetronomePreset[]; setlists?: Setlist[] } | null) => {
        if (!mounted || !data) return;
        if (Array.isArray(data.presets) && data.presets.length > 0) {
          const localRaw = readStoredJson<MetronomePreset[] | null>(STORAGE_KEYS.presets, null);
          if (!localRaw || maxUpdated(data.presets) >= maxUpdated(localRaw)) {
            setPresets(data.presets);
            writeStoredJson(STORAGE_KEYS.presets, data.presets);
          }
        }
        if (Array.isArray(data.setlists) && data.setlists.length > 0) {
          const localRaw = readStoredJson<Setlist[] | null>(STORAGE_KEYS.setlists, null);
          if (!localRaw || maxUpdated(data.setlists) >= maxUpdated(localRaw)) {
            setSetlists(data.setlists);
            writeStoredJson(STORAGE_KEYS.setlists, data.setlists);
          }
        }
      })
      .catch(() => {
        // offline fallback uses cached/default state
      });
    return () => {
      mounted = false;
    };
  }, []);

  // UI Animation clock (strictly decoupled from Audio clock & high-frequency beatPhase)
  const [timeline, setTimeline] = useState<TimelineSnapshot>(() =>
    evaluateTimeline(activeSession, localClockOffsetRef.current)
  );
  const lastDiscreteTimelineKeyRef = useRef<string>('');

  useEffect(() => {
    const offset = isWireless ? serverOffsetRef.current : localClockOffsetRef.current;
    if (!activeSession.playback.isPlaying) {
      lastDiscreteTimelineKeyRef.current = '';
      setTimeline(evaluateTimeline(activeSession, offset));
      setAudioSuspended(false);
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

      const snap = evaluateTimeline(
        activeSession,
        isWireless ? serverOffsetRef.current : localClockOffsetRef.current
      );

      // Only trigger React re-renders on discrete beat/subdivision/state boundaries.
      // Continuous 60/120fps phase animations sample getTimelineSnapshot() directly.
      const discreteKey = `${snap.isPlaying ? 1 : 0}|${snap.isCountingIn ? 1 : 0}|${snap.currentBar}|${snap.currentBeat}|${snap.currentSubdivision}|${snap.subdivisionsPerBeat}|${snap.countInDisplayText ?? ''}`;
      if (discreteKey !== lastDiscreteTimelineKeyRef.current) {
        lastDiscreteTimelineKeyRef.current = discreteKey;
        setTimeline(snap);
      }

      const totalBeatFloor = Math.floor(snap.totalBeatsElapsed);
      if (
        accessibility.hapticBeat &&
        snap.isPlaying &&
        totalBeatFloor !== lastHapticBeatRef.current
      ) {
        lastHapticBeatRef.current = totalBeatFloor;
        const accent =
          activeSession.accentPattern[snap.currentBeat] ??
          (snap.currentBeat === 0 ? 'accent' : 'normal');
        const isAccent = accent === 'accent';
        if (accent !== 'mute' && (!accessibility.hapticAccentOnly || isAccent)) {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(isAccent ? 32 : 16);
            } catch {
              // ignore unsupported vibrate errors
            }
          }
        }
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
  }, [
    accessibility.hapticAccentOnly,
    accessibility.hapticBeat,
    activeSession,
    isWireless,
  ]);

  // Local mode server-equivalent tempoSection & autoAdvance automation
  useEffect(() => {
    if (localAutomationTimerRef.current) {
      clearTimeout(localAutomationTimerRef.current);
      localAutomationTimerRef.current = null;
    }
    if (isWireless || !localSession.playback.isPlaying || localSession.setlist.length === 0) {
      return;
    }

    const song = localSession.setlist[localSession.activeSongIndex];
    if (!song) return;

    const beatsPerBar = Math.max(1, localSession.timeSignature.numerator);
    const countInBeats = localSession.countInBars * beatsPerBar;
    const now = Date.now();
    const dt = Math.max(0, now - localSession.playback.anchorServerMs);
    const currentTotalBeats = localSession.playback.anchorTotalBeats + (dt / 60000) * localSession.bpm;
    const songBeatsElapsed = currentTotalBeats - countInBeats;

    if (song.tempoSections && song.tempoSections.length > 0) {
      const idx = localSession.playback.activeSectionIndex;
      const sec = song.tempoSections[idx];
      if (sec && sec.bars > 0) {
        let targetCumulative = 0;
        for (let i = 0; i <= idx; i++) {
          targetCumulative += (song.tempoSections[i]?.bars ?? 0) * beatsPerBar;
        }
        const beatsLeft = targetCumulative - Math.max(0, songBeatsElapsed);
        if (beatsLeft > 0) {
          const msUntil = (beatsLeft / localSession.bpm) * 60000;
          localAutomationTimerRef.current = window.setTimeout(() => {
            setLocalSession((prev) => {
              if (!prev.playback.isPlaying) return prev;
              const s = prev.setlist[prev.activeSongIndex];
              if (!s?.tempoSections) return prev;
              const nextIdx = prev.playback.activeSectionIndex + 1;
              if (nextIdx < s.tempoSections.length) {
                const tNow = Date.now();
                const tb =
                  prev.playback.anchorTotalBeats +
                  (Math.max(0, tNow - prev.playback.anchorServerMs) / 60000) * prev.bpm;
                return {
                  ...prev,
                  bpm: s.tempoSections[nextIdx].bpm,
                  playback: {
                    ...prev.playback,
                    anchorServerMs: tNow,
                    anchorTotalBeats: tb,
                    activeSectionIndex: nextIdx,
                    sequenceId: prev.playback.sequenceId + 1,
                  },
                };
              }
              if (s.autoAdvance && prev.activeSongIndex + 1 < prev.setlist.length) {
                const nextSong = prev.setlist[prev.activeSongIndex + 1];
                const startBpm = nextSong.tempoSections?.[0]?.bpm ?? nextSong.bpm;
                return {
                  ...prev,
                  activeSongIndex: prev.activeSongIndex + 1,
                  bpm: startBpm,
                  timeSignature: { ...nextSong.timeSignature },
                  subdivision: nextSong.subdivision,
                  accentPattern: [...nextSong.accentPattern],
                  countInBars: nextSong.countInBars,
                  clickProfile: { ...prev.clickProfile, normalSound: nextSong.clickSound },
                  playback: {
                    isPlaying: true,
                    anchorServerMs: Date.now() + 80,
                    anchorTotalBeats: 0,
                    activeSectionIndex: 0,
                    sequenceId: prev.playback.sequenceId + 1,
                  },
                };
              }
              return prev;
            });
          }, Math.max(20, msUntil));
          return;
        }
      }
    }

    if (song.autoAdvance && song.bars > 0 && localSession.activeSongIndex + 1 < localSession.setlist.length) {
      const targetBeats = song.bars * beatsPerBar;
      const beatsLeft = targetBeats - Math.max(0, songBeatsElapsed);
      if (beatsLeft > 0) {
        const msUntil = (beatsLeft / localSession.bpm) * 60000;
        localAutomationTimerRef.current = window.setTimeout(() => {
          setLocalSession((prev) => {
            if (!prev.playback.isPlaying || prev.activeSongIndex + 1 >= prev.setlist.length) return prev;
            const nextSong = prev.setlist[prev.activeSongIndex + 1];
            const startBpm = nextSong.tempoSections?.[0]?.bpm ?? nextSong.bpm;
            return {
              ...prev,
              activeSongIndex: prev.activeSongIndex + 1,
              bpm: startBpm,
              timeSignature: { ...nextSong.timeSignature },
              subdivision: nextSong.subdivision,
              accentPattern: [...nextSong.accentPattern],
              countInBars: nextSong.countInBars,
              clickProfile: { ...prev.clickProfile, normalSound: nextSong.clickSound },
              playback: {
                isPlaying: true,
                anchorServerMs: Date.now() + 80,
                anchorTotalBeats: 0,
                activeSectionIndex: 0,
                sequenceId: prev.playback.sequenceId + 1,
              },
            };
          });
        }, Math.max(20, msUntil));
      }
    }

    return () => {
      if (localAutomationTimerRef.current) {
        clearTimeout(localAutomationTimerRef.current);
        localAutomationTimerRef.current = null;
      }
    };
  }, [isWireless, localSession]);

  const recordClockSample = useCallback(
    (clientSendTime: number, serverTime: number, serverRecvTime?: number) => {
      const clientRecvTime = performance.now();
      if (
        !Number.isFinite(clientSendTime) ||
        !Number.isFinite(serverTime) ||
        clientRecvTime < clientSendTime
      ) {
        return null;
      }

      consecutiveFailuresRef.current = 0;

      const totalRtt = Math.max(0, clientRecvTime - clientSendTime);
      const t2 =
        typeof serverRecvTime === 'number' && Number.isFinite(serverRecvTime)
          ? serverRecvTime
          : serverTime;
      const t3 = Math.max(t2, serverTime);
      const serverProcMs = Math.max(0, Math.min(totalRtt, t3 - t2));
      const networkRtt = Math.max(0, totalRtt - serverProcMs);
      const estimatedOffset = (t2 - clientSendTime + (t3 - clientRecvTime)) / 2;

      const samples = clockSamplesRef.current;
      const existingMinRtt =
        samples.length > 0 ? Math.min(...samples.map((s) => s.rtt)) : networkRtt;
      const isOutlierSpike =
        samples.length >= 3 && networkRtt > Math.max(900, existingMinRtt * 3.5);

      if (!isOutlierSpike) {
        samples.push({
          rtt: networkRtt,
          offset: estimatedOffset,
          recordedAt: clientRecvTime,
        });
      }

      // Drop stale samples older than 60s when we have plenty of recent ones
      while (samples.length > 4 && clientRecvTime - samples[0].recordedAt > 60_000) {
        samples.shift();
      }
      while (samples.length > 16) {
        samples.shift();
      }

      if (samples.length === 0) {
        samples.push({
          rtt: networkRtt,
          offset: estimatedOffset,
          recordedAt: clientRecvTime,
        });
      }

      const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
      const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.5)));

      // Inverse-RTT weighting favors the cleanest low-jitter packets
      let weightSum = 0;
      let weightedOffsetSum = 0;
      for (const s of best) {
        const w = 1 / (s.rtt + 12);
        weightSum += w;
        weightedOffsetSum += s.offset * w;
      }
      const targetOffset = weightedOffsetSum / Math.max(1e-6, weightSum);

      // Smooth EMA once locked so tiny Wi-Fi jitter never jerks audio phase
      const smoothedOffset =
        samples.length >= 3 && Math.abs(targetOffset - serverOffsetRef.current) < 60
          ? serverOffsetRef.current * 0.72 + targetOffset * 0.28
          : targetOffset;

      const oneWay = Math.round(best[0].rtt / 2);
      const unstableRttThreshold = transportModeRef.current === 'http' ? 1400 : 900;

      serverOffsetRef.current = smoothedOffset;
      setLatencyMs(oneWay);

      const quality: ConnectionQuality =
        samples.length < 2
          ? 'syncing'
          : best[0].rtt > unstableRttThreshold
          ? 'unstable'
          : 'synced';
      computedQualityRef.current = quality;
      setConnectionQuality(quality);

      setRemoteSession((prev) => {
        if (prev) {
          audioEngine.updateSyncState(prev, smoothedOffset);
        }
        return prev;
      });

      return { oneWay, quality, sampleCount: samples.length };
    },
    []
  );

  const clearBurstTimers = useCallback(() => {
    for (const id of burstTimersRef.current) {
      window.clearTimeout(id);
    }
    burstTimersRef.current = [];
  }, []);

  const cleanupSocket = useCallback(() => {
    clearBurstTimers();
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (httpPollTimerRef.current) {
      clearInterval(httpPollTimerRef.current);
      httpPollTimerRef.current = null;
    }
    if (httpAbortRef.current) {
      try {
        httpAbortRef.current.abort();
      } catch {
        // ignore
      }
      httpAbortRef.current = null;
    }
    httpSyncNowRef.current = null;
    httpInFlightRef.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearBurstTimers]);

  const sendWs = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendCommand = useCallback(
    (payload: Record<string, unknown>) => {
      if (transportModeRef.current === 'ws') {
        sendWs(payload);
        return;
      }
      const creds = credsRef.current;
      if (!creds) return;
      const sendTime = performance.now();
      void fetch(apiUrl(`/api/sessions/${encodeURIComponent(creds.sessionId)}/command`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ...payload,
          participantId: creds.participantId,
          token: creds.token,
        }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            session?: MetronomeSessionState;
            newSessionId?: string;
            ended?: boolean;
            serverRecvTime?: number;
            serverTime?: number;
          };
          if (typeof data.serverTime === 'number') {
            recordClockSample(sendTime, data.serverTime, data.serverRecvTime);
          }
          if (data.ended) {
            manualDisconnectRef.current = true;
            cleanupSocket();
            credsRef.current = null;
            setCredentials(null);
            setRemoteSession(null);
            setConnectionQuality('synced');
            return;
          }
          if (data.newSessionId && credsRef.current) {
            const updated = { ...credsRef.current, sessionId: data.newSessionId };
            credsRef.current = updated;
            setCredentials(updated);
            setStatusBanner(`Session code updated to ${data.newSessionId}`);
          }
          if (res.ok && data.session) {
            setRemoteSession(data.session);
          }
        })
        .catch(() => {
          // next poll will reconcile
        });
    },
    [cleanupSocket, recordClockSample, sendWs]
  );

  const startHttpSync = useCallback(
    (_creds: AuthCredentials) => {
      cleanupSocket();
      manualDisconnectRef.current = false;
      transportModeRef.current = 'http';
      clockSamplesRef.current = [];
      consecutiveFailuresRef.current = 0;
      computedQualityRef.current = 'syncing';
      setConnectionQuality('syncing');
      setReconnecting(false);

      const syncOnce = async () => {
        const activeCreds = credsRef.current;
        if (!activeCreds || manualDisconnectRef.current || httpInFlightRef.current) return;
        httpInFlightRef.current = true;
        const controller = new AbortController();
        httpAbortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 6000);
        const sendTime = performance.now();
        try {
          const bestLatency =
            clockSamplesRef.current.length > 0
              ? Math.round(Math.min(...clockSamplesRef.current.map((s) => s.rtt)) / 2)
              : 0;
          const reportedStatus =
            computedQualityRef.current === 'offline' ? 'syncing' : computedQualityRef.current;
          const res = await fetch(
            apiUrl(`/api/sessions/${encodeURIComponent(activeCreds.sessionId)}/sync`),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store',
              signal: controller.signal,
              body: JSON.stringify({
                participantId: activeCreds.participantId,
                token: activeCreds.token,
                latencyMs: bestLatency,
                status: reportedStatus,
              }),
            }
          );
          const data = (await res.json().catch(() => ({}))) as {
            session?: MetronomeSessionState;
            serverRecvTime?: number;
            serverTime?: number;
            ended?: boolean;
            kicked?: boolean;
            error?: string;
          };

          if (data.kicked) {
            manualDisconnectRef.current = true;
            cleanupSocket();
            credsRef.current = null;
            setCredentials(null);
            setRemoteSession(null);
            setConnectionQuality('synced');
            setStatusBanner('You were removed from the session by the host.');
            return;
          }
          if (data.ended || res.status === 404 || res.status === 410) {
            manualDisconnectRef.current = true;
            cleanupSocket();
            credsRef.current = null;
            setCredentials(null);
            setRemoteSession(null);
            setConnectionQuality('synced');
            setStatusBanner('The rehearsal session has ended.');
            return;
          }
          if (res.ok && data.session) {
            consecutiveFailuresRef.current = 0;
            if (typeof data.serverTime === 'number') {
              recordClockSample(sendTime, data.serverTime, data.serverRecvTime);
            }
            setRemoteSession(data.session);
            setStatusBanner(null);
            setReconnecting(false);
          } else if (!res.ok) {
            consecutiveFailuresRef.current += 1;
            if (consecutiveFailuresRef.current >= 4) {
              computedQualityRef.current = 'offline';
              setConnectionQuality('offline');
            } else if (consecutiveFailuresRef.current >= 2) {
              computedQualityRef.current = 'unstable';
              setConnectionQuality('unstable');
            }
          }
        } catch {
          if (!manualDisconnectRef.current) {
            consecutiveFailuresRef.current += 1;
            if (consecutiveFailuresRef.current >= 4) {
              computedQualityRef.current = 'offline';
              setConnectionQuality('offline');
            } else if (consecutiveFailuresRef.current >= 2) {
              computedQualityRef.current = 'unstable';
              setConnectionQuality('unstable');
            }
          }
        } finally {
          window.clearTimeout(timeoutId);
          if (httpAbortRef.current === controller) {
            httpAbortRef.current = null;
          }
          httpInFlightRef.current = false;
        }
      };

      httpSyncNowRef.current = () => {
        void syncOnce();
      };

      void syncOnce();
      for (let i = 1; i <= 2; i++) {
        const id = window.setTimeout(() => {
          void syncOnce();
        }, i * 160);
        burstTimersRef.current.push(id);
      }
      httpPollTimerRef.current = window.setInterval(() => {
        void syncOnce();
      }, 900);
    },
    [cleanupSocket, recordClockSample]
  );

  const connectWebSocket = useCallback(
    (creds: AuthCredentials) => {
      cleanupSocket();
      manualDisconnectRef.current = false;
      transportModeRef.current = 'ws';
      consecutiveFailuresRef.current = 0;
      computedQualityRef.current = 'syncing';
      setConnectionQuality('syncing');

      let wsOpened = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        startHttpSync(creds);
        return;
      }
      wsRef.current = ws;

      const handshakeTimer = window.setTimeout(() => {
        if (!wsOpened && !manualDisconnectRef.current && credsRef.current) {
          try {
            ws.onclose = null;
            ws.onerror = null;
            ws.onmessage = null;
            ws.close();
          } catch {
            // ignore
          }
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          startHttpSync(credsRef.current);
        }
      }, 2500);

      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clock:ping', clientSendTime: performance.now() }));
        }
      };

      ws.onopen = () => {
        wsOpened = true;
        lastMessageAtRef.current = performance.now();
        window.clearTimeout(handshakeTimer);
        transportModeRef.current = 'ws';
        reconnectAttemptRef.current = 0;
        consecutiveFailuresRef.current = 0;
        setReconnecting(false);
        ws.send(
          JSON.stringify({
            type: 'auth',
            sessionId: creds.sessionId,
            participantId: creds.participantId,
            token: creds.token,
          })
        );

        // Burst of 5 rapid clock calibration pings
        clockSamplesRef.current = [];
        for (let i = 0; i < 5; i++) {
          const id = window.setTimeout(sendPing, i * 110);
          burstTimersRef.current.push(id);
        }

        pingTimerRef.current = window.setInterval(() => {
          if (performance.now() - lastMessageAtRef.current > 8500) {
            // Half-open mobile socket detected (silent drop without close frame); force clean reconnect
            try {
              ws.close();
            } catch {
              // ignore
            }
            return;
          }
          sendPing();
        }, 2000);
      };

      ws.onmessage = (event) => {
        lastMessageAtRef.current = performance.now();
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'clock:pong') {
          const stats = recordClockSample(
            Number(msg.clientSendTime),
            Number(msg.serverTime),
            typeof msg.serverRecvTime === 'number' ? msg.serverRecvTime : undefined
          );
          if (stats && (stats.sampleCount % 3 === 0 || stats.sampleCount === 2)) {
            sendWs({ type: 'client:metrics', latencyMs: stats.oneWay, status: stats.quality });
          }
          return;
        }

        if (msg.type === 'session:state' && msg.session) {
          const nextState = msg.session as MetronomeSessionState;
          setRemoteSession(nextState);
          setStatusBanner(null);
          return;
        }

        if (msg.type === 'session:codeChanged' && typeof msg.newSessionId === 'string') {
          const newId = msg.newSessionId;
          if (credsRef.current) {
            const updated = { ...credsRef.current, sessionId: newId };
            credsRef.current = updated;
            setCredentials(updated);
          }
          if (msg.session) {
            setRemoteSession(msg.session as MetronomeSessionState);
          }
          setStatusBanner(`Session code updated to ${newId}`);
          return;
        }

        if (msg.type === 'session:kicked') {
          manualDisconnectRef.current = true;
          cleanupSocket();
          credsRef.current = null;
          setCredentials(null);
          setRemoteSession(null);
          setConnectionQuality('synced');
          setStatusBanner('You were removed from the session by the host.');
          return;
        }

        if (msg.type === 'session:ended') {
          manualDisconnectRef.current = true;
          cleanupSocket();
          credsRef.current = null;
          setCredentials(null);
          setRemoteSession(null);
          setConnectionQuality('synced');
          setStatusBanner('The host ended the rehearsal session.');
          return;
        }

        if (msg.type === 'session:error') {
          manualDisconnectRef.current = true;
          cleanupSocket();
          credsRef.current = null;
          setCredentials(null);
          setRemoteSession(null);
          setStatusBanner(typeof msg.error === 'string' ? msg.error : 'Session connection error');
        }
      };

      ws.onclose = () => {
        window.clearTimeout(handshakeTimer);
        clearBurstTimers();
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (manualDisconnectRef.current || !credsRef.current) return;

        // On serverless hosts like Vercel where WebSocket upgrades fail immediately,
        // seamlessly switch to HTTP clock-calibrated synchronization.
        if (!wsOpened) {
          startHttpSync(credsRef.current);
          return;
        }

        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = attempt + 1;
        setReconnecting(true);
        setConnectionQuality(attempt === 0 ? 'syncing' : 'offline');
        const delay = Math.min(5000, attempt === 0 ? 350 : 800 * Math.pow(1.5, attempt));
        reconnectTimerRef.current = window.setTimeout(() => {
          if (credsRef.current && !manualDisconnectRef.current) {
            connectWebSocket(credsRef.current);
          }
        }, delay);
      };
    },
    [cleanupSocket, clearBurstTimers, recordClockSample, sendWs, startHttpSync]
  );

  // Immediately re-calibrate clock offset when returning from device lock or regaining network
  useEffect(() => {
    const triggerFastResync = () => {
      if (!credsRef.current || manualDisconnectRef.current) return;
      if (transportModeRef.current === 'http') {
        httpSyncNowRef.current?.();
        return;
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        for (let i = 0; i < 3; i++) {
          const id = window.setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'clock:ping', clientSendTime: performance.now() }));
            }
          }, i * 120);
          burstTimersRef.current.push(id);
        }
      } else {
        connectWebSocket(credsRef.current);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerFastResync();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', triggerFastResync);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', triggerFastResync);
    };
  }, [connectWebSocket]);

  useEffect(() => {
    return () => {
      manualDisconnectRef.current = true;
      cleanupSocket();
    };
  }, [cleanupSocket]);

  const createSession = useCallback(
    async (opts: { name: string; hostName: string; hostRole: MusicianRole }) => {
      try {
        audioEngine.ensureContext();
      } catch {
        // allow session creation even if browser restricts Web Audio initialization
      }
      setAudioSuspended(false);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error(
          'You appear to be offline. Reconnect to the internet before starting a live wireless session.'
        );
      }

      // Persist chosen host identity into local configuration as well
      setLocalSession((prev) => ({
        ...prev,
        name: opts.name,
        hostName: opts.hostName,
        hostRole: opts.hostRole,
      }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      let res: Response;
      try {
        res = await fetch(apiUrl('/api/sessions'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: opts.name,
            hostName: opts.hostName,
            hostRole: opts.hostRole,
            bpm: localSession.bpm,
            timeSignature: localSession.timeSignature,
            accentPattern: localSession.accentPattern,
            subdivision: localSession.subdivision,
            clickSound: localSession.clickProfile.normalSound,
            clickProfile: localSession.clickProfile,
            countInBars: localSession.countInBars,
            setlist: localSession.setlist,
            activeSetlistId: localSession.activeSetlistId,
            activeSongIndex: localSession.activeSongIndex,
          }),
        });
      } catch (err) {
        const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
        throw new Error(
          `Could not reach the SyncBeat session server${reason}. Verify your connection and try again.`
        );
      }

      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: string; details?: string }
          | null;
        if (errBody?.error) {
          throw new Error(
            errBody.details ? `${errBody.error}: ${errBody.details}` : errBody.error
          );
        }
        throw new Error(
          `Session creation failed with server status HTTP ${res.status}. Please try again in a moment.`
        );
      }

      const data = (await res.json().catch(() => null)) as {
        session?: MetronomeSessionState;
        participantId?: string;
        token?: string;
      } | null;

      if (!data?.session?.sessionId || !data.participantId || !data.token) {
        throw new Error(
          'Session server returned an incomplete response. Please refresh and try creating the session again.'
        );
      }

      const creds: AuthCredentials = {
        sessionId: data.session.sessionId,
        participantId: data.participantId,
        token: data.token,
      };
      credsRef.current = creds;
      setCredentials(creds);
      setRemoteSession(data.session);
      setStatusBanner(null);
      connectWebSocket(creds);
      return data.session;
    },
    [connectWebSocket, idToken, localSession]
  );

  const joinSession = useCallback(
    async (opts: { code: string; name: string; role: MusicianRole }) => {
      try {
        audioEngine.ensureContext();
      } catch {
        // allow session join even if browser restricts Web Audio initialization
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error(
          'You appear to be offline. Reconnect to the internet to join a live session.'
        );
      }
      const cleanCode = opts.code.toUpperCase().trim();
      let res: Response;
      try {
        res = await fetch(apiUrl(`/api/sessions/${encodeURIComponent(cleanCode)}/join`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: opts.name, role: opts.role }),
        });
      } catch (err) {
        const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
        throw new Error(
          `Could not reach the SyncBeat session server${reason}. Verify your connection and try again.`
        );
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          errBody?.error || `Failed to join session ${cleanCode} (HTTP ${res.status}).`
        );
      }
      const data = (await res.json().catch(() => null)) as {
        session?: MetronomeSessionState;
        participantId?: string;
        token?: string;
      } | null;
      if (!data?.session?.sessionId || !data.participantId || !data.token) {
        throw new Error('Server returned an incomplete join response. Please try again.');
      }
      const creds: AuthCredentials = {
        sessionId: data.session.sessionId,
        participantId: data.participantId,
        token: data.token,
      };
      credsRef.current = creds;
      setCredentials(creds);
      setRemoteSession(data.session);
      setStatusBanner(null);
      connectWebSocket(creds);
      return data.session;
    },
    [connectWebSocket]
  );

  const leaveSession = useCallback(() => {
    manualDisconnectRef.current = true;
    cleanupSocket();
    credsRef.current = null;
    setCredentials(null);
    setRemoteSession(null);
    setLocalMasterVolume(null);
    setConnectionQuality('synced');
    setLatencyMs(0);
    setReconnecting(false);
    setStatusBanner(null);
  }, [cleanupSocket]);

  const endSession = useCallback(() => {
    if (isWireless && isHost && remoteSession) {
      const now = Date.now();
      setLocalSession((prev) => ({
        ...prev,
        name: remoteSession.name,
        hostName: remoteSession.hostName,
        hostRole: remoteSession.hostRole,
        bpm: remoteSession.bpm,
        timeSignature: { ...remoteSession.timeSignature },
        accentPattern: [...remoteSession.accentPattern],
        subdivision: remoteSession.subdivision,
        clickProfile: { ...remoteSession.clickProfile },
        countInBars: remoteSession.countInBars,
        activeSetlistId: remoteSession.activeSetlistId,
        activeSongIndex: remoteSession.activeSongIndex,
        setlist: [...remoteSession.setlist],
        participants: prev.participants.map((p) =>
          p.id === LOCAL_HOST_ID
            ? { ...p, name: remoteSession.hostName, role: remoteSession.hostRole }
            : p
        ),
        playback: {
          ...prev.playback,
          isPlaying: false,
          anchorServerMs: now,
          anchorTotalBeats: 0,
          activeSectionIndex: 0,
          sequenceId: prev.playback.sequenceId + 1,
        },
        lastActivityAt: now,
      }));
      sendCommand({ type: 'host:endSession' });
    }
    leaveSession();
  }, [isHost, isWireless, leaveSession, remoteSession, sendCommand]);

  const forceResync = useCallback(() => {
    if (!isWireless || !credsRef.current) return;
    if (transportModeRef.current === 'http') {
      startHttpSync(credsRef.current);
    } else {
      connectWebSocket(credsRef.current);
    }
  }, [connectWebSocket, isWireless, startHttpSync]);

  // Transport controls
  const play = useCallback(() => {
    try {
      audioEngine.ensureContext();
    } catch {
      // ignore
    }
    if (isWireless) {
      if (!permissions.playStop) return;
      sendCommand({ type: 'transport:play' });
      return;
    }
    setLocalSession((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        isPlaying: true,
        anchorServerMs: Date.now() + 50,
        sequenceId: prev.playback.sequenceId + 1,
      },
    }));
  }, [isWireless, permissions.playStop, sendCommand]);

  const pause = useCallback(() => {
    if (isWireless) {
      if (!permissions.playStop) return;
      sendCommand({ type: 'transport:pause' });
      return;
    }
    setLocalSession((prev) => {
      const now = Date.now();
      const dt = Math.max(0, now - prev.playback.anchorServerMs);
      const beats = prev.playback.isPlaying
        ? prev.playback.anchorTotalBeats + (dt / 60000) * prev.bpm
        : prev.playback.anchorTotalBeats;
      return {
        ...prev,
        playback: {
          ...prev.playback,
          isPlaying: false,
          anchorTotalBeats: beats,
          anchorServerMs: now,
          sequenceId: prev.playback.sequenceId + 1,
        },
      };
    });
  }, [isWireless, permissions.playStop, sendCommand]);

  const stop = useCallback(() => {
    if (isWireless) {
      if (!permissions.playStop) return;
      sendCommand({ type: 'transport:stop' });
      return;
    }
    setLocalSession((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        isPlaying: false,
        anchorTotalBeats: 0,
        anchorServerMs: Date.now(),
        activeSectionIndex: 0,
        sequenceId: prev.playback.sequenceId + 1,
      },
    }));
  }, [isWireless, permissions.playStop, sendCommand]);

  const restart = useCallback(() => {
    try {
      audioEngine.ensureContext();
    } catch {
      // ignore
    }
    if (isWireless) {
      if (!permissions.playStop) return;
      sendCommand({ type: 'transport:restart' });
      return;
    }
    setLocalSession((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        isPlaying: true,
        anchorTotalBeats: 0,
        anchorServerMs: Date.now() + 50,
        activeSectionIndex: 0,
        sequenceId: prev.playback.sequenceId + 1,
      },
    }));
  }, [isWireless, permissions.playStop, sendCommand]);

  const updateMetronome = useCallback(
    (patch: {
      bpm?: number;
      timeSignature?: TimeSignature;
      accentPattern?: MetronomeSessionState['accentPattern'];
      subdivision?: SubdivisionType;
      clickProfile?: Partial<ClickProfile>;
      countInBars?: CountInBars;
      name?: string;
      isLocked?: boolean;
    }) => {
      if (isWireless) {
        if (
          !isHost &&
          patch.clickProfile &&
          typeof patch.clickProfile.masterVolume === 'number' &&
          Object.keys(patch).every((k) => k === 'clickProfile') &&
          Object.keys(patch.clickProfile).every((k) => k === 'masterVolume')
        ) {
          setLocalMasterVolume(Math.min(1, Math.max(0, patch.clickProfile.masterVolume)));
          return;
        }
        const bpmOnly = Object.keys(patch).every((k) => k === 'bpm');
        if (bpmOnly ? !permissions.bpm : !isHost) return;
        sendCommand({ type: 'metronome:update', patch });
        return;
      }

      setLocalSession((prev) => {
        const now = Date.now();
        let nextPlayback = { ...prev.playback };
        let nextBpm = prev.bpm;

        if (patch.bpm !== undefined) {
          nextBpm = Math.round(Math.min(300, Math.max(20, patch.bpm)) * 10) / 10;
          if (prev.playback.isPlaying) {
            const dt = Math.max(0, now - prev.playback.anchorServerMs);
            nextPlayback.anchorTotalBeats = prev.playback.anchorTotalBeats + (dt / 60000) * prev.bpm;
            nextPlayback.anchorServerMs = now;
          }
          nextPlayback.sequenceId += 1;
        }

        let nextTs = prev.timeSignature;
        let nextAccent = prev.accentPattern;
        if (patch.timeSignature) {
          nextTs = patch.timeSignature;
          if (!patch.accentPattern) {
            nextAccent = buildAccentPattern(nextTs);
          }
          nextPlayback.sequenceId += 1;
        }
        if (patch.accentPattern) {
          nextAccent = patch.accentPattern;
        }

        if (patch.subdivision !== undefined || patch.countInBars !== undefined) {
          nextPlayback.sequenceId += 1;
        }

        return {
          ...prev,
          bpm: nextBpm,
          timeSignature: nextTs,
          accentPattern: nextAccent,
          subdivision: patch.subdivision ?? prev.subdivision,
          countInBars: patch.countInBars ?? prev.countInBars,
          name: patch.name ?? prev.name,
          isLocked: patch.isLocked ?? prev.isLocked,
          clickProfile: patch.clickProfile
            ? { ...prev.clickProfile, ...patch.clickProfile }
            : prev.clickProfile,
          playback: nextPlayback,
        };
      });
    },
    [isHost, isWireless, permissions.bpm, sendCommand]
  );

  const registerTap = useCallback(() => {
    try {
      audioEngine.ensureContext();
    } catch {
      // ignore
    }
    setAudioSuspended(false);
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2200) {
      tapTimesRef.current = [now];
      setTapCount(1);
    } else {
      taps.push(now);
      if (taps.length > 6) taps.shift();
      setTapCount(taps.length);
    }

    if (tapResetTimerRef.current) {
      window.clearTimeout(tapResetTimerRef.current);
    }
    tapResetTimerRef.current = window.setTimeout(() => {
      setTapCount(0);
    }, 2200);

    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const lastIntervalMs = intervals[intervals.length - 1];
      const instantBpm = Math.round(Math.min(300, Math.max(20, 60000 / Math.max(150, lastIntervalMs))));
      setTapBpmHistory((prev) => [...prev.slice(-4), instantBpm]);

      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(Math.min(300, Math.max(20, 60000 / avgMs)));
      updateMetronome({ bpm });
    }
  }, [updateMetronome]);

  const clearTapBpmHistory = useCallback(() => {
    setTapBpmHistory([]);
  }, []);

  const selectSong = useCallback(
    (index: number) => {
      if (isWireless) {
        if (!permissions.setlistNav) return;
        sendCommand({ type: 'setlist:selectSong', index });
        return;
      }
      setLocalSession((prev) => {
        if (prev.setlist.length === 0) return prev;
        const idx = Math.max(0, Math.min(prev.setlist.length - 1, index));
        const song = prev.setlist[idx];
        const startBpm = song.tempoSections?.[0]?.bpm ?? song.bpm;
        return {
          ...prev,
          activeSongIndex: idx,
          bpm: startBpm,
          timeSignature: { ...song.timeSignature },
          subdivision: song.subdivision,
          accentPattern: [...song.accentPattern],
          countInBars: song.countInBars,
          clickProfile: { ...prev.clickProfile, normalSound: song.clickSound },
          playback: {
            ...prev.playback,
            anchorTotalBeats: 0,
            anchorServerMs: prev.playback.isPlaying ? Date.now() + 60 : Date.now(),
            activeSectionIndex: 0,
            sequenceId: prev.playback.sequenceId + 1,
          },
        };
      });
    },
    [isWireless, permissions.setlistNav, sendCommand]
  );

  const loadSetlistToSession = useCallback(
    (items: SetlistItem[], setlistId: string | null) => {
      if (isWireless) {
        if (!isHost) return;
        sendCommand({ type: 'setlist:load', items, setlistId });
        return;
      }
      setLocalSession((prev) => ({
        ...prev,
        activeSetlistId: setlistId,
        setlist: items,
        activeSongIndex: Math.min(prev.activeSongIndex, Math.max(0, items.length - 1)),
      }));
    },
    [isHost, isWireless, sendCommand]
  );

  const applyPreset = useCallback(
    (preset: MetronomePreset) => {
      updateMetronome({
        bpm: preset.bpm,
        timeSignature: { ...preset.timeSignature },
        accentPattern: [...preset.accentPattern],
        subdivision: preset.subdivision,
        countInBars: preset.countInBars,
        clickProfile: { normalSound: preset.clickSound },
      });
    },
    [updateMetronome]
  );

  const regenerateCode = useCallback(() => {
    if (isWireless && isHost) {
      sendCommand({ type: 'host:regenerateCode' });
    }
  }, [isHost, isWireless, sendCommand]);

  const controlParticipant = useCallback(
    (
      targetId: string,
      action: 'remove' | 'toggleMute' | 'setPermissions',
      perms?: Partial<RemotePermissions>
    ) => {
      if (isWireless && isHost) {
        sendCommand({ type: 'host:participantControl', targetId, action, permissions: perms });
      }
    },
    [isHost, isWireless, sendCommand]
  );

  const savePresetsLibrary = useCallback(
    async (nextPresets: MetronomePreset[]) => {
      setPresets(nextPresets);
      try {
        window.localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(nextPresets));
      } catch {
        // ignore
      }
      try {
        if (idToken) {
          await fetch(apiUrl('/api/user/library'), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ presets: nextPresets, setlists }),
          });
        } else {
          await fetch(apiUrl('/api/library/presets'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presets: nextPresets }),
          });
        }
      } catch {
        // ignore network error; client state updated
      }
    },
    [idToken, setlists]
  );

  const saveSetlistsLibrary = useCallback(
    async (nextSetlists: Setlist[]) => {
      setSetlists(nextSetlists);
      try {
        window.localStorage.setItem(STORAGE_KEYS.setlists, JSON.stringify(nextSetlists));
      } catch {
        // ignore
      }
      // If active setlist is currently loaded, reflect edits in live session too
      const matching = nextSetlists.find((s) => s.id === activeSession.activeSetlistId);
      if (matching && isHost) {
        loadSetlistToSession(matching.items, matching.id);
      }
      try {
        if (idToken) {
          await fetch(apiUrl('/api/user/library'), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ presets, setlists: nextSetlists }),
          });
        } else {
          await fetch(apiUrl('/api/library/setlists'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setlists: nextSetlists }),
          });
        }
      } catch {
        // ignore network error
      }
    },
    [activeSession.activeSetlistId, idToken, isHost, loadSetlistToSession, presets]
  );

  const previewClick = useCallback((soundId: ClickSoundId, isAccent = false) => {
    audioEngine.previewSound(soundId, isAccent, activeSession.clickProfile.masterVolume);
    setAudioSuspended(false);
  }, [activeSession.clickProfile.masterVolume]);

  const previewVocalCount = useCallback(() => {
    audioEngine.previewVocalCount(
      (activeSession.clickProfile.vocalVolume ?? 0.9) * activeSession.clickProfile.masterVolume,
      activeSession.clickProfile.vocalStyle ?? 'auto'
    );
    setAudioSuspended(false);
  }, [
    activeSession.clickProfile.masterVolume,
    activeSession.clickProfile.vocalStyle,
    activeSession.clickProfile.vocalVolume,
  ]);

  const unlockAudio = useCallback(async () => {
    const ok = await audioEngine.unlockAudio();
    setAudioSuspended(!ok);
  }, []);

  const toggleLocalSelfMute = useCallback(() => {
    setLocalSelfMuted((prev) => !prev);
  }, []);

  const setDeviceOffsetMs = useCallback((ms: number) => {
    setDeviceOffsetMsState(Math.max(-100, Math.min(100, Math.round(ms))));
  }, []);

  const dismissBanner = useCallback(() => setStatusBanner(null), []);

  return useMemo(
    () => ({
      session: activeSession,
      timeline,
      getTimelineSnapshot,
      isWireless,
      isHost,
      me,
      permissions,
      connectionQuality,
      latencyMs,
      reconnecting,
      statusBanner,
      dismissBanner,
      presets,
      setlists,
      localSelfMuted,
      toggleLocalSelfMute,
      audioSuspended,
      unlockAudio,
      deviceOffsetMs,
      setDeviceOffsetMs,
      tapCount,
      tapBpmHistory,
      clearTapBpmHistory,
      createSession,
      joinSession,
      leaveSession,
      endSession,
      forceResync,
      play,
      pause,
      stop,
      restart,
      updateMetronome,
      registerTap,
      selectSong,
      loadSetlistToSession,
      applyPreset,
      regenerateCode,
      controlParticipant,
      savePresetsLibrary,
      saveSetlistsLibrary,
      previewClick,
      previewVocalCount,
    }),
    [
      activeSession,
      applyPreset,
      audioSuspended,
      clearTapBpmHistory,
      connectionQuality,
      controlParticipant,
      createSession,
      deviceOffsetMs,
      dismissBanner,
      endSession,
      forceResync,
      getTimelineSnapshot,
      isHost,
      isWireless,
      joinSession,
      latencyMs,
      leaveSession,
      loadSetlistToSession,
      localSelfMuted,
      me,
      pause,
      permissions,
      play,
      presets,
      previewClick,
      previewVocalCount,
      reconnecting,
      regenerateCode,
      registerTap,
      restart,
      savePresetsLibrary,
      saveSetlistsLibrary,
      selectSong,
      setDeviceOffsetMs,
      setlists,
      statusBanner,
      stop,
      tapBpmHistory,
      tapCount,
      timeline,
      toggleLocalSelfMute,
      unlockAudio,
      updateMetronome,
    ]
  );
}
