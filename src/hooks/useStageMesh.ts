import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MetronomeSessionState,
  Participant,
  StageMeshStatus,
  StageSignalMessage,
} from '../types/metronome';

interface PeerLinkEntry {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  connected: boolean;
  rttMs: number | null;
  pendingIce: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  lastRelayOffsetEstimate: number | null;
}

interface UseStageMeshOptions {
  enabled: boolean;
  sessionId: string | null;
  myParticipantId: string | null;
  participants: Participant[];
  transportMode: 'ws' | 'http';
  onSendSignal: (toParticipantId: string, kind: 'offer' | 'answer' | 'ice', payload: unknown) => void;
  onReceiveMeshState: (
    state: MetronomeSessionState,
    relayedOffsetEstimate: number | null,
    meshRttMs: number | null
  ) => void;
  onRelayCommandToServer: (payload: Record<string, unknown>) => void;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 2,
};

export function useStageMesh({
  enabled,
  sessionId,
  myParticipantId,
  participants,
  transportMode,
  onSendSignal,
  onReceiveMeshState,
  onRelayCommandToServer,
}: UseStageMeshOptions) {
  const peersRef = useRef<Map<string, PeerLinkEntry>>(new Map());
  const lastForwardedVersionRef = useRef<string>('');
  const serverOffsetRef = useRef<number>(0);

  const [meshStatus, setMeshStatus] = useState<StageMeshStatus>({
    enabled,
    connectedPeers: 0,
    knownPeers: 0,
    relayedSyncActive: false,
    avgMeshLatencyMs: null,
    transportDetail: transportMode,
  });

  const onSendSignalRef = useRef(onSendSignal);
  onSendSignalRef.current = onSendSignal;
  const onReceiveMeshStateRef = useRef(onReceiveMeshState);
  onReceiveMeshStateRef.current = onReceiveMeshState;
  const onRelayCommandRef = useRef(onRelayCommandToServer);
  onRelayCommandRef.current = onRelayCommandToServer;

  const publishStatus = useCallback(
    (relayedActive = false) => {
      const entries = Array.from(peersRef.current.values());
      const openEntries = entries.filter((p) => p.connected);
      const rtts = openEntries
        .map((p) => p.rttMs)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const avg =
        rtts.length > 0 ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;

      setMeshStatus((prev) => ({
        enabled,
        connectedPeers: openEntries.length,
        knownPeers: entries.length,
        relayedSyncActive: relayedActive || prev.relayedSyncActive,
        avgMeshLatencyMs: avg,
        transportDetail:
          relayedActive && openEntries.length > 0 ? 'mesh-relay' : transportMode,
      }));
    },
    [enabled, transportMode]
  );

  const closePeer = useCallback(
    (peerId: string) => {
      const entry = peersRef.current.get(peerId);
      if (!entry) return;
      try {
        entry.dc?.close();
      } catch {
        // ignore
      }
      try {
        entry.pc.close();
      } catch {
        // ignore
      }
      peersRef.current.delete(peerId);
      publishStatus(false);
    },
    [publishStatus]
  );

  const closeAllPeers = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) {
      const entry = peersRef.current.get(peerId);
      if (entry) {
        try {
          entry.dc?.close();
        } catch {
          // ignore
        }
        try {
          entry.pc.close();
        } catch {
          // ignore
        }
      }
    }
    peersRef.current.clear();
    lastForwardedVersionRef.current = '';
    setMeshStatus({
      enabled,
      connectedPeers: 0,
      knownPeers: 0,
      relayedSyncActive: false,
      avgMeshLatencyMs: null,
      transportDetail: transportMode,
    });
  }, [enabled, transportMode]);

  const attachDataChannel = useCallback(
    (entry: PeerLinkEntry, dc: RTCDataChannel) => {
      entry.dc = dc;

      dc.onopen = () => {
        entry.connected = true;
        publishStatus(false);
        try {
          dc.send(
            JSON.stringify({
              type: 'mesh:ping',
              clientSendPerf: performance.now(),
              senderOffsetMs: serverOffsetRef.current,
            })
          );
        } catch {
          // ignore
        }
      };

      dc.onclose = () => {
        entry.connected = false;
        publishStatus(false);
      };

      dc.onerror = () => {
        entry.connected = false;
        publishStatus(false);
      };

      dc.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'mesh:ping') {
          if (dc.readyState === 'open') {
            dc.send(
              JSON.stringify({
                type: 'mesh:pong',
                clientSendPerf: msg.clientSendPerf,
                responderPerf: performance.now(),
                responderOffsetMs: serverOffsetRef.current,
              })
            );
          }
          return;
        }

        if (msg.type === 'mesh:pong') {
          const sent = Number(msg.clientSendPerf);
          const nowPerf = performance.now();
          if (Number.isFinite(sent) && nowPerf >= sent) {
            const rtt = Math.round(nowPerf - sent);
            entry.rttMs = rtt;
            const responderPerf = Number(msg.responderPerf);
            const responderOffset = Number(msg.responderOffsetMs);
            if (Number.isFinite(responderPerf) && Number.isFinite(responderOffset)) {
              const midpointPerf = (sent + nowPerf) / 2;
              entry.lastRelayOffsetEstimate =
                responderPerf - midpointPerf + responderOffset;
            }
            publishStatus(false);
          }
          return;
        }

        if (msg.type === 'mesh:state' && msg.session && typeof msg.session === 'object') {
          const incomingState = msg.session as MetronomeSessionState;
          const hopCount = typeof msg.hopCount === 'number' ? msg.hopCount : 1;
          const senderOffset =
            typeof msg.senderOffsetMs === 'number' && Number.isFinite(msg.senderOffsetMs)
              ? msg.senderOffsetMs
              : entry.lastRelayOffsetEstimate;

          onReceiveMeshStateRef.current(incomingState, senderOffset, entry.rttMs);
          publishStatus(true);

          // Multi-hop extension: forward newer state up to 3 hops across scattered stage peers
          const versionKey = `${incomingState.playback.sequenceId}:${incomingState.lastActivityAt}:${incomingState.participants.length}`;
          if (hopCount < 3 && lastForwardedVersionRef.current !== versionKey) {
            lastForwardedVersionRef.current = versionKey;
            const relayPayload = JSON.stringify({
              type: 'mesh:state',
              session: incomingState,
              hopCount: hopCount + 1,
              senderOffsetMs: serverOffsetRef.current,
            });
            for (const other of peersRef.current.values()) {
              if (
                other.peerId !== entry.peerId &&
                other.connected &&
                other.dc?.readyState === 'open'
              ) {
                try {
                  other.dc.send(relayPayload);
                } catch {
                  // ignore individual peer failure
                }
              }
            }
          }
          return;
        }

        if (msg.type === 'mesh:command' && msg.payload && typeof msg.payload === 'object') {
          onRelayCommandRef.current(msg.payload as Record<string, unknown>);
        }
      };
    },
    [publishStatus]
  );

  const ensurePeerEntry = useCallback(
    (peerId: string, initiateOffer: boolean): PeerLinkEntry | null => {
      if (typeof RTCPeerConnection === 'undefined') return null;
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_CONFIG);
      const entry: PeerLinkEntry = {
        peerId,
        pc,
        dc: null,
        connected: false,
        rttMs: null,
        pendingIce: [],
        remoteDescSet: false,
        lastRelayOffsetEstimate: null,
      };
      peersRef.current.set(peerId, entry);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          onSendSignalRef.current(peerId, 'ice', ev.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          entry.connected = false;
          publishStatus(false);
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            closePeer(peerId);
          }
        }
      };

      pc.ondatachannel = (ev) => {
        attachDataChannel(entry, ev.channel);
      };

      if (initiateOffer) {
        const dc = pc.createDataChannel('syncbeat-mesh', { ordered: true });
        attachDataChannel(entry, dc);
        void pc
          .createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              onSendSignalRef.current(peerId, 'offer', pc.localDescription);
            }
          })
          .catch(() => {
            closePeer(peerId);
          });
      }

      publishStatus(false);
      return entry;
    },
    [attachDataChannel, closePeer, publishStatus]
  );

  // Sync peer list when session/participants change
  useEffect(() => {
    if (!enabled || !sessionId || !myParticipantId || typeof RTCPeerConnection === 'undefined') {
      closeAllPeers();
      return;
    }

    const activePeerIds = new Set(
      participants
        .map((p) => p.id)
        .filter((id) => id && id !== myParticipantId)
    );

    for (const existingId of Array.from(peersRef.current.keys())) {
      if (!activePeerIds.has(existingId)) {
        closePeer(existingId);
      }
    }

    for (const peerId of activePeerIds) {
      if (!peersRef.current.has(peerId)) {
        // Deterministic initiator avoids simultaneous offer collision
        const shouldInitiate = myParticipantId < peerId;
        if (shouldInitiate) {
          ensurePeerEntry(peerId, true);
        }
      }
    }
  }, [closeAllPeers, closePeer, enabled, ensurePeerEntry, myParticipantId, participants, sessionId]);

  // Periodic P2P latency + clock health ping across open DataChannels
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const id = window.setInterval(() => {
      for (const entry of peersRef.current.values()) {
        if (entry.connected && entry.dc?.readyState === 'open') {
          try {
            entry.dc.send(
              JSON.stringify({
                type: 'mesh:ping',
                clientSendPerf: performance.now(),
                senderOffsetMs: serverOffsetRef.current,
              })
            );
          } catch {
            // ignore
          }
        }
      }
    }, 3500);
    return () => window.clearInterval(id);
  }, [enabled, sessionId]);

  const handleIncomingSignals = useCallback(
    async (signals: StageSignalMessage[]) => {
      if (!enabled || !sessionId || !myParticipantId || typeof RTCPeerConnection === 'undefined') {
        return;
      }
      for (const sig of signals) {
        if (!sig || sig.toParticipantId !== myParticipantId || !sig.fromParticipantId) continue;
        const fromId = sig.fromParticipantId;

        if (sig.kind === 'offer') {
          const entry = ensurePeerEntry(fromId, false);
          if (!entry) continue;
          try {
            await entry.pc.setRemoteDescription(
              new RTCSessionDescription(sig.payload as RTCSessionDescriptionInit)
            );
            entry.remoteDescSet = true;
            for (const ice of entry.pendingIce) {
              await entry.pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
            }
            entry.pendingIce = [];
            const answer = await entry.pc.createAnswer();
            await entry.pc.setLocalDescription(answer);
            if (entry.pc.localDescription) {
              onSendSignalRef.current(fromId, 'answer', entry.pc.localDescription);
            }
          } catch {
            closePeer(fromId);
          }
        } else if (sig.kind === 'answer') {
          const entry = peersRef.current.get(fromId);
          if (!entry) continue;
          try {
            if (entry.pc.signalingState === 'have-local-offer') {
              await entry.pc.setRemoteDescription(
                new RTCSessionDescription(sig.payload as RTCSessionDescriptionInit)
              );
              entry.remoteDescSet = true;
              for (const ice of entry.pendingIce) {
                await entry.pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
              }
              entry.pendingIce = [];
            }
          } catch {
            closePeer(fromId);
          }
        } else if (sig.kind === 'ice') {
          const entry = peersRef.current.get(fromId) ?? ensurePeerEntry(fromId, false);
          if (!entry) continue;
          const candidate = sig.payload as RTCIceCandidateInit;
          if (!entry.remoteDescSet) {
            entry.pendingIce.push(candidate);
          } else {
            await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
        }
      }
    },
    [closePeer, enabled, ensurePeerEntry, myParticipantId, sessionId]
  );

  const broadcastMeshState = useCallback(
    (state: MetronomeSessionState, currentServerOffsetMs: number) => {
      serverOffsetRef.current = currentServerOffsetMs;
      if (!enabled) return;
      const versionKey = `${state.playback.sequenceId}:${state.lastActivityAt}:${state.participants.length}`;
      if (lastForwardedVersionRef.current === versionKey) return;
      lastForwardedVersionRef.current = versionKey;

      const payload = JSON.stringify({
        type: 'mesh:state',
        session: state,
        hopCount: 1,
        senderOffsetMs: currentServerOffsetMs,
      });

      for (const entry of peersRef.current.values()) {
        if (entry.connected && entry.dc?.readyState === 'open') {
          try {
            entry.dc.send(payload);
          } catch {
            // ignore
          }
        }
      }
    },
    [enabled]
  );

  const sendCommandViaMesh = useCallback(
    (payload: Record<string, unknown>): boolean => {
      if (!enabled) return false;
      const wrapped = JSON.stringify({ type: 'mesh:command', payload });
      let sent = false;
      for (const entry of peersRef.current.values()) {
        if (entry.connected && entry.dc?.readyState === 'open') {
          try {
            entry.dc.send(wrapped);
            sent = true;
          } catch {
            // ignore
          }
        }
      }
      return sent;
    },
    [enabled]
  );

  const updateOffsetEstimate = useCallback((offsetMs: number) => {
    serverOffsetRef.current = offsetMs;
  }, []);

  useEffect(() => {
    publishStatus(false);
  }, [enabled, transportMode, publishStatus]);

  useEffect(() => {
    return () => {
      closeAllPeers();
    };
  }, [closeAllPeers]);

  return {
    meshStatus,
    handleIncomingSignals,
    broadcastMeshState,
    sendCommandViaMesh,
    updateOffsetEstimate,
  };
}
