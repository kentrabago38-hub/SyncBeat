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

interface AuthCredentials {
  sessionId: string;
  participantId: string;
  token: string;
}

interface ClockSample {
  rtt: number;
  offset: number;
}

const LOCAL_HOST_ID = 'local-musician';
const STORAGE_KEYS = {
  presets: 'syncbeat:presets:v1',
  setlists: 'syncbeat:setlists:v1',
  deviceOffsetMs: 'syncbeat:deviceOffsetMs:v1',
};

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

function createInitialLocalState(): MetronomeSessionState {
  const now = Date.now();
  const initialSong = DEFAULT_SETLISTS[0].items[0];
  return {
    sessionId: 'LOCAL',
    name: 'Solo Practice',
    hostId: LOCAL_HOST_ID,
    hostName: 'You',
    hostRole: 'Keyboard',
    isLocked: false,
    bpm: initialSong.bpm,
    timeSignature: { ...initialSong.timeSignature },
    accentPattern: [...initialSong.accentPattern],
    subdivision: initialSong.subdivision,
    clickProfile: {
      ...DEFAULT_CLICK_PROFILE,
      normalSound: initialSong.clickSound,
    },
    countInBars: initialSong.countInBars,
    playback: {
      isPlaying: false,
      anchorServerMs: now,
      anchorTotalBeats: 0,
      sequenceId: 1,
      activeSectionIndex: 0,
    },
    activeSetlistId: DEFAULT_SETLISTS[0].id,
    activeSongIndex: 0,
    setlist: [...DEFAULT_SETLISTS[0].items],
    participants: [
      {
        id: LOCAL_HOST_ID,
        name: 'You',
        role: 'Keyboard',
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

export function useMetronomeSync(accessibility: AccessibilitySettings) {
  const [localSession, setLocalSession] = useState<MetronomeSessionState>(createInitialLocalState);
  const [remoteSession, setRemoteSession] = useState<MetronomeSessionState | null>(null);
  const [credentials, setCredentials] = useState<AuthCredentials | null>(null);

  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('synced');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const [localSelfMuted, setLocalSelfMuted] = useState(false);
  const [audioSuspended, setAudioSuspended] = useState(false);
  const [tapCount, setTapCount] = useState(0);
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
  const clockSamplesRef = useRef<ClockSample[]>([]);
  const localClockOffsetRef = useRef<number>(Date.now() - performance.now());
  const serverOffsetRef = useRef<number>(0);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const manualDisconnectRef = useRef<boolean>(false);
  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);
  const localAutomationTimerRef = useRef<number | null>(null);

  const isWireless = Boolean(credentials && remoteSession);
  const activeSession = isWireless && remoteSession ? remoteSession : localSession;
  const myParticipantId = credentials?.participantId ?? LOCAL_HOST_ID;

  const me = useMemo(
    () => activeSession.participants.find((p) => p.id === myParticipantId) ?? null,
    [activeSession.participants, myParticipantId]
  );

  const isHost = !isWireless || activeSession.hostId === myParticipantId;

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

  // Sync audio engine whenever session state or offset updates
  useEffect(() => {
    const offset = isWireless ? serverOffsetRef.current : localClockOffsetRef.current;
    audioEngine.updateSyncState(activeSession, offset);
    setAudioSuspended(activeSession.playback.isPlaying && audioEngine.isSuspended());
  }, [activeSession, isWireless]);

  // Load presets & setlists from backend
  useEffect(() => {
    let mounted = true;
    fetch('/api/library')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { presets?: MetronomePreset[]; setlists?: Setlist[] } | null) => {
        if (!mounted || !data) return;
        if (Array.isArray(data.presets) && data.presets.length > 0) {
          setPresets(data.presets);
          try {
            window.localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(data.presets));
          } catch {
            // ignore
          }
        }
        if (Array.isArray(data.setlists) && data.setlists.length > 0) {
          setSetlists(data.setlists);
          try {
            window.localStorage.setItem(STORAGE_KEYS.setlists, JSON.stringify(data.setlists));
          } catch {
            // ignore
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

  // UI Animation clock (strictly decoupled from Audio clock)
  const [timeline, setTimeline] = useState<TimelineSnapshot>(() =>
    evaluateTimeline(activeSession, localClockOffsetRef.current)
  );

  useEffect(() => {
    const offset = isWireless ? serverOffsetRef.current : localClockOffsetRef.current;
    if (!activeSession.playback.isPlaying) {
      setTimeline(evaluateTimeline(activeSession, offset));
      setAudioSuspended(false);
      return;
    }

    let rafId = 0;
    const frame = () => {
      const snap = evaluateTimeline(
        activeSession,
        isWireless ? serverOffsetRef.current : localClockOffsetRef.current
      );
      setTimeline(snap);

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

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
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

  const sendWs = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(
    (creds: AuthCredentials) => {
      cleanupSocket();
      manualDisconnectRef.current = false;
      setConnectionQuality('syncing');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clock:ping', clientSendTime: performance.now() }));
        }
      };

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
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
          window.setTimeout(sendPing, i * 110);
        }

        pingTimerRef.current = window.setInterval(sendPing, 2000);
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'clock:pong') {
          const clientSendTime = Number(msg.clientSendTime);
          const serverTime = Number(msg.serverTime);
          const clientRecvTime = performance.now();
          if (Number.isFinite(clientSendTime) && Number.isFinite(serverTime)) {
            const rtt = Math.max(0, clientRecvTime - clientSendTime);
            const estimatedOffset = serverTime - (clientSendTime + rtt / 2);

            const samples = clockSamplesRef.current;
            samples.push({ rtt, offset: estimatedOffset });
            if (samples.length > 12) samples.shift();

            // Use average of lowest-RTT half of samples to reject jitter
            const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
            const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
            const avgOffset = best.reduce((acc, s) => acc + s.offset, 0) / best.length;
            const oneWay = Math.round(best[0].rtt / 2);

            serverOffsetRef.current = avgOffset;
            setLatencyMs(oneWay);

            const quality: ConnectionQuality =
              samples.length < 2
                ? 'syncing'
                : best[0].rtt > 180
                ? 'unstable'
                : 'synced';
            setConnectionQuality(quality);

            // Re-sync audio engine offset smoothly
            setRemoteSession((prev) => {
              if (prev) {
                audioEngine.updateSyncState(prev, avgOffset);
              }
              return prev;
            });

            if (samples.length % 3 === 0 || samples.length === 2) {
              sendWs({ type: 'client:metrics', latencyMs: oneWay, status: quality });
            }
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
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (manualDisconnectRef.current || !credsRef.current) return;

        setConnectionQuality('offline');
        setReconnecting(true);
        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = attempt + 1;
        const delay = Math.min(5000, 800 * Math.pow(1.5, attempt));
        reconnectTimerRef.current = window.setTimeout(() => {
          if (credsRef.current && !manualDisconnectRef.current) {
            connectWebSocket(credsRef.current);
          }
        }, delay);
      };
    },
    [cleanupSocket, sendWs]
  );

  useEffect(() => {
    return () => {
      manualDisconnectRef.current = true;
      cleanupSocket();
    };
  }, [cleanupSocket]);

  const createSession = useCallback(
    async (opts: { name: string; hostName: string; hostRole: MusicianRole }) => {
      audioEngine.ensureContext();
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: opts.name,
          hostName: opts.hostName,
          hostRole: opts.hostRole,
          bpm: localSession.bpm,
          timeSignature: localSession.timeSignature,
          subdivision: localSession.subdivision,
          clickSound: localSession.clickProfile.normalSound,
          countInBars: localSession.countInBars,
          setlist: localSession.setlist,
          activeSetlistId: localSession.activeSetlistId,
          activeSongIndex: localSession.activeSongIndex,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Could not create session');
      }
      const data = (await res.json()) as {
        session: MetronomeSessionState;
        participantId: string;
        token: string;
      };
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
    [connectWebSocket, localSession]
  );

  const joinSession = useCallback(
    async (opts: { code: string; name: string; role: MusicianRole }) => {
      audioEngine.ensureContext();
      const cleanCode = opts.code.toUpperCase().trim();
      const res = await fetch(`/api/sessions/${encodeURIComponent(cleanCode)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: opts.name, role: opts.role }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Failed to join session');
      }
      const data = (await res.json()) as {
        session: MetronomeSessionState;
        participantId: string;
        token: string;
      };
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
    setConnectionQuality('synced');
    setLatencyMs(0);
    setReconnecting(false);
    setStatusBanner(null);
  }, [cleanupSocket]);

  const endSession = useCallback(() => {
    if (isWireless && isHost) {
      sendWs({ type: 'host:endSession' });
    }
    leaveSession();
  }, [isHost, isWireless, leaveSession, sendWs]);

  const forceResync = useCallback(() => {
    if (!isWireless || !credsRef.current) return;
    connectWebSocket(credsRef.current);
  }, [connectWebSocket, isWireless]);

  // Transport controls
  const play = useCallback(() => {
    audioEngine.ensureContext();
    if (isWireless) {
      if (!permissions.playStop) return;
      sendWs({ type: 'transport:play' });
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
  }, [isWireless, permissions.playStop, sendWs]);

  const pause = useCallback(() => {
    if (isWireless) {
      if (!permissions.playStop) return;
      sendWs({ type: 'transport:pause' });
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
  }, [isWireless, permissions.playStop, sendWs]);

  const stop = useCallback(() => {
    if (isWireless) {
      if (!permissions.playStop) return;
      sendWs({ type: 'transport:stop' });
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
  }, [isWireless, permissions.playStop, sendWs]);

  const restart = useCallback(() => {
    audioEngine.ensureContext();
    if (isWireless) {
      if (!permissions.playStop) return;
      sendWs({ type: 'transport:restart' });
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
  }, [isWireless, permissions.playStop, sendWs]);

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
        const bpmOnly = Object.keys(patch).every((k) => k === 'bpm');
        if (bpmOnly ? !permissions.bpm : !isHost) return;
        sendWs({ type: 'metronome:update', patch });
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
    [isHost, isWireless, permissions.bpm, sendWs]
  );

  const registerTap = useCallback(() => {
    audioEngine.ensureContext();
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
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(Math.min(300, Math.max(20, 60000 / avgMs)));
      updateMetronome({ bpm });
    }
  }, [updateMetronome]);

  const selectSong = useCallback(
    (index: number) => {
      if (isWireless) {
        if (!permissions.setlistNav) return;
        sendWs({ type: 'setlist:selectSong', index });
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
    [isWireless, permissions.setlistNav, sendWs]
  );

  const loadSetlistToSession = useCallback(
    (items: SetlistItem[], setlistId: string | null) => {
      if (isWireless) {
        if (!isHost) return;
        sendWs({ type: 'setlist:load', items, setlistId });
        return;
      }
      setLocalSession((prev) => ({
        ...prev,
        activeSetlistId: setlistId,
        setlist: items,
        activeSongIndex: Math.min(prev.activeSongIndex, Math.max(0, items.length - 1)),
      }));
    },
    [isHost, isWireless, sendWs]
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
      sendWs({ type: 'host:regenerateCode' });
    }
  }, [isHost, isWireless, sendWs]);

  const controlParticipant = useCallback(
    (
      targetId: string,
      action: 'remove' | 'toggleMute' | 'setPermissions',
      perms?: Partial<RemotePermissions>
    ) => {
      if (isWireless && isHost) {
        sendWs({ type: 'host:participantControl', targetId, action, permissions: perms });
      }
    },
    [isHost, isWireless, sendWs]
  );

  const savePresetsLibrary = useCallback(async (nextPresets: MetronomePreset[]) => {
    setPresets(nextPresets);
    try {
      window.localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(nextPresets));
    } catch {
      // ignore
    }
    try {
      await fetch('/api/library/presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: nextPresets }),
      });
    } catch {
      // ignore network error; client state updated
    }
  }, []);

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
        await fetch('/api/library/setlists', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setlists: nextSetlists }),
        });
      } catch {
        // ignore network error
      }
    },
    [activeSession.activeSetlistId, isHost, loadSetlistToSession]
  );

  const previewClick = useCallback((soundId: ClickSoundId, isAccent = false) => {
    audioEngine.previewSound(soundId, isAccent, activeSession.clickProfile.masterVolume);
    setAudioSuspended(false);
  }, [activeSession.clickProfile.masterVolume]);

  const previewVocalCount = useCallback(() => {
    audioEngine.previewVocalCount(
      (activeSession.clickProfile.vocalVolume ?? 0.9) * activeSession.clickProfile.masterVolume
    );
    setAudioSuspended(false);
  }, [
    activeSession.clickProfile.masterVolume,
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
      connectionQuality,
      controlParticipant,
      createSession,
      deviceOffsetMs,
      dismissBanner,
      endSession,
      forceResync,
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
      tapCount,
      timeline,
      toggleLocalSelfMute,
      unlockAudio,
      updateMetronome,
    ]
  );
}
