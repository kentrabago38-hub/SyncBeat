import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Lock,
  LogOut,
  QrCode,
  Radio,
  RefreshCw,
  Share2,
  Shield,
  Smartphone,
  Unlock,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useState } from 'react';
import { MUSICIAN_ROLES } from '../constants/metronomeData';
import {
  ConnectionQuality,
  MetronomeSessionState,
  MusicianRole,
  Participant,
  RemotePermissions,
} from '../types/metronome';
import { ConnectionBadge } from './ConnectionBadge';
import { SyncBeatLogo } from './SyncBeatLogo';

interface SessionPanelProps {
  session: MetronomeSessionState;
  isWireless: boolean;
  isHost: boolean;
  me: Participant | null;
  connectionQuality: ConnectionQuality;
  latencyMs: number;
  reconnecting: boolean;
  onCreateSession: (opts: {
    name: string;
    hostName: string;
    hostRole: MusicianRole;
  }) => Promise<unknown>;
  onJoinSession: (opts: {
    code: string;
    name: string;
    role: MusicianRole;
  }) => Promise<unknown>;
  onLeaveSession: () => void;
  onEndSession: () => void;
  onForceResync: () => void;
  onRegenerateCode: () => void;
  onUpdateSessionMeta: (patch: { name?: string; isLocked?: boolean }) => void;
  onControlParticipant: (
    targetId: string,
    action: 'remove' | 'toggleMute' | 'setPermissions',
    perms?: Partial<RemotePermissions>
  ) => void;
  compactSidebar?: boolean;
}

export const SessionPanel: React.FC<SessionPanelProps> = React.memo(({
  session,
  isWireless,
  isHost,
  me,
  connectionQuality,
  latencyMs,
  reconnecting,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
  onEndSession,
  onForceResync,
  onRegenerateCode,
  onUpdateSessionMeta,
  onControlParticipant,
  compactSidebar = false,
}) => {
  const [sessionName, setSessionName] = useState(() =>
    session.name && session.name !== 'Solo Practice' ? session.name : 'Sunday Worship Rehearsal'
  );
  const [hostName, setHostName] = useState(() =>
    session.hostName && session.hostName !== 'You' ? session.hostName : 'Worship Leader'
  );
  const [hostRole, setHostRole] = useState<MusicianRole>(() => session.hostRole ?? 'Keyboard');

  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinRole, setJoinRole] = useState<MusicianRole>('Guitar');

  const [busyAction, setBusyAction] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${session.sessionId}`
      : '';

  const copyText = (text: string, type: 'code' | 'link') => {
    void navigator.clipboard?.writeText(text);
    setCopiedType(type);
    window.setTimeout(() => setCopiedType(null), 1800);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${session.name} on SyncBeat`,
          text: `Connect to our synchronized metronome session (${session.sessionId})`,
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported
      }
    }
    copyText(shareUrl, 'link');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusyAction('create');
    try {
      await onCreateSession({
        name: sessionName.trim() || 'Band Rehearsal',
        hostName: hostName.trim() || 'Host',
        hostRole,
      });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Unable to create a live session. Please check your connection and try again.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError(null);
    setBusyAction('join');
    try {
      await onJoinSession({
        code: joinCode.trim().toUpperCase(),
        name: joinName.trim() || joinRole,
        role: joinRole,
      });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to join session. Check the session code and try again.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // Not yet in a wireless session
  if (!isWireless) {
    return (
      <div className={compactSidebar ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {error && (
          <div
            role="alert"
            className={`flex items-start justify-between gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 ${
              compactSidebar ? '' : 'md:col-span-2'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-0.5 text-rose-600 hover:text-rose-900 dark:text-rose-300 dark:hover:text-white shrink-0"
              aria-label="Dismiss session error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Create Host Session */}
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Host Live Session
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Generate a QR code for your band
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Session Name
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                maxLength={48}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Instrument
                </label>
                <select
                  value={hostRole}
                  onChange={(e) => setHostRole(e.target.value as MusicianRole)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  {MUSICIAN_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busyAction !== null}
            className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-60 transition"
          >
            {busyAction === 'create' && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{busyAction === 'create' ? 'Creating Session...' : 'Create Session'}</span>
          </button>
        </form>

        {/* Join Existing Session */}
        <form
          onSubmit={(e) => void handleJoin(e)}
          className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-200">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Join Rehearsal
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Enter a 5-character session code
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Session Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7K4P9"
                maxLength={8}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono-tabular text-base font-bold tracking-widest uppercase text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Name (Optional)
                </label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g. Jorich"
                  maxLength={32}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Your Role
                </label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as MusicianRole)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  {MUSICIAN_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busyAction !== null || joinCode.trim().length < 4}
            className="studio-keycap inline-flex w-full h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 font-display text-sm font-bold text-slate-900 hover:bg-slate-200 dark:border-white/15 dark:bg-[#181B23] dark:text-white dark:hover:bg-white/10 disabled:opacity-40 transition"
          >
            {busyAction === 'join' && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{busyAction === 'join' ? 'Joining Session...' : 'Join Session'}</span>
          </button>
        </form>

        {/* Mobile Install & Rehearsal Sharing Guide */}
        <div
          className={`hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-4 space-y-2.5 ${
            compactSidebar ? '' : 'md:col-span-2'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-white">
            <SyncBeatLogo variant="icon" className="w-7 h-7" />
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Install on Phone &amp; Share with Band</span>
            </div>
          </div>
          <ol className="space-y-1.5 text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
            <li>
              <strong className="text-slate-800 dark:text-zinc-200">1. Install on your phone:</strong>{' '}
              Open this URL in <span className="text-slate-800 dark:text-zinc-200">Safari (iPhone)</span> →
              Share → <span className="text-slate-800 dark:text-zinc-200">Add to Home Screen</span>, or in{' '}
              <span className="text-slate-800 dark:text-zinc-200">Chrome (Android)</span> → Menu →{' '}
              <span className="text-slate-800 dark:text-zinc-200">Install App</span>.
            </li>
            <li>
              <strong className="text-slate-800 dark:text-zinc-200">2. Share with musicians:</strong> Tap{' '}
              <span className="text-amber-600 dark:text-amber-400">Create Session</span> above to generate
              a live QR code and 5-character join code for rehearsals &amp; live stage use.
            </li>
          </ol>
        </div>
      </div>
    );
  }

  // Active Wireless Session View (Host or Participant)
  return (
    <div className="space-y-4">
      {/* Live Session Header & QR Card */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <ConnectionBadge
                quality={connectionQuality}
                latencyMs={latencyMs}
                isWireless={true}
                reconnecting={reconnecting}
              />
              {session.isLocked && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </div>
            <h2 className="mt-1.5 font-display text-xl font-bold text-slate-900 dark:text-white truncate">
              {session.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              {isHost
                ? `Hosting as ${session.hostRole} (${session.hostName})`
                : `Host: ${session.hostRole} (${session.hostName}) · You: ${me?.role ?? 'Musician'}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isHost && (
              <button
                type="button"
                onClick={onForceResync}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10"
                title="Recalculate clock offset and resync"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Resync</span>
              </button>
            )}
            {isHost ? (
              <button
                type="button"
                onClick={onEndSession}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:border-rose-500/30 dark:text-rose-300"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>End Session</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onLeaveSession}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>

        {/* QR Code & Join Code Share Strip */}
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-slate-200 bg-slate-100 dark:border-white/[0.06] dark:bg-[#181B23] p-4">
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="shrink-0 rounded-xl border border-slate-200 dark:border-transparent bg-white p-2.5 hover:scale-[1.02] transition-transform"
            title="Tap to enlarge QR code for bandmates"
          >
            <QRCodeSVG value={shareUrl} size={compactSidebar ? 88 : 116} level="M" />
          </button>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Session Code
            </div>
            <div className="mt-0.5 font-mono-tabular text-3xl font-bold tracking-[0.18em] text-amber-600 dark:text-amber-400">
              {session.sessionId}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400 truncate">{shareUrl}</div>

            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <button
                type="button"
                onClick={() => copyText(session.sessionId, 'code')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-zinc-200 dark:hover:bg-white/10"
              >
                {copiedType === 'code' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedType === 'code' ? 'Copied' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => copyText(shareUrl, 'link')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-zinc-200 dark:hover:bg-white/10"
              >
                {copiedType === 'link' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <QrCode className="w-3.5 h-3.5" />
                )}
                <span>{copiedType === 'link' ? 'Link Copied' : 'Copy Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Host Security Controls */}
        {isHost && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateSessionMeta({ isLocked: !session.isLocked })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {session.isLocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Unlock Session</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Session</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onRegenerateCode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-300 dark:hover:bg-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>New Join Code</span>
            </button>
          </div>
        )}
      </section>

      {/* Connected Musicians Roster */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
            Connected Musicians ({session.participants.length})
          </h3>
          {!isHost && (
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              {me?.permissions.playStop || me?.permissions.bpm || me?.permissions.setlistNav
                ? 'Remote Control Enabled'
                : 'View & Sync Only'}
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
          {session.participants.map((p) => {
            const dotColor =
              p.status === 'synced'
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : p.status === 'syncing'
                ? 'bg-amber-500 dark:bg-amber-400'
                : p.status === 'unstable'
                ? 'bg-orange-500 dark:bg-orange-400'
                : 'bg-rose-500';

            return (
              <div key={p.id} className="py-3 first:pt-1 last:pb-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white truncate">
                        <span>{p.role}</span>
                        <span className="text-slate-400 dark:text-zinc-500">—</span>
                        <span className="text-slate-600 dark:text-zinc-300 truncate">{p.name}</span>
                        {p.isHost && (
                          <span className="text-[11px] font-mono-tabular uppercase text-amber-600 dark:text-amber-400">
                            · Host
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-zinc-500">
                        {p.status.toUpperCase()}
                        {!p.isHost && p.status !== 'offline' ? ` · ${p.latencyMs} ms` : ''}
                        {p.isMuted ? ' · MUTED' : ''}
                      </div>
                    </div>
                  </div>

                  {isHost && !p.isHost && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onControlParticipant(p.id, 'toggleMute')}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                          p.isMuted
                            ? 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'border-slate-200 bg-slate-100 text-slate-500 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-400 dark:hover:text-white'
                        }`}
                        title={p.isMuted ? 'Unmute musician click' : 'Mute musician click'}
                      >
                        {p.isMuted ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onControlParticipant(p.id, 'remove')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500 hover:border-rose-500/40 hover:text-rose-600 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-400 dark:hover:text-rose-400"
                        title="Remove musician from session"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Remote Control Permissions (Host can grant per musician) */}
                {isHost && !p.isHost && !compactSidebar && (
                  <div className="flex flex-wrap items-center gap-2 pl-5 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-zinc-500">
                      <Shield className="w-3 h-3" /> Remote:
                    </span>
                    {(
                      [
                        { key: 'playStop', label: 'Play/Stop' },
                        { key: 'bpm', label: 'BPM' },
                        { key: 'setlistNav', label: 'Setlist' },
                      ] as const
                    ).map((perm) => (
                      <button
                        key={perm.key}
                        type="button"
                        onClick={() =>
                          onControlParticipant(p.id, 'setPermissions', {
                            [perm.key]: !p.permissions[perm.key],
                          })
                        }
                        className={`rounded-md px-2 py-1 font-medium transition ${
                          p.permissions[perm.key]
                            ? 'bg-amber-500/20 text-amber-800 border border-amber-500/45 dark:text-amber-300 dark:border-amber-500/40'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-900 dark:bg-[#181B23] dark:text-zinc-500 dark:border-white/5 dark:hover:text-zinc-300'
                        }`}
                      >
                        {perm.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Enlarged QR Code Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm sm:p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="animate-sheet-up pb-safe w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#12141A] p-6 sm:p-7 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" aria-hidden="true" />
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {session.name}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Scan with any phone camera to sync instantly
            </p>
            <div className="mt-5 inline-block rounded-2xl border border-slate-200 dark:border-transparent bg-white p-4">
              <QRCodeSVG value={shareUrl} size={220} level="M" />
            </div>
            <div className="mt-4 font-mono-tabular text-3xl font-bold tracking-[0.2em] text-amber-600 dark:text-amber-400">
              {session.sessionId}
            </div>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 dark:bg-white/10 dark:hover:bg-white/15 py-2.5 text-sm font-medium dark:text-white min-h-[44px]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
SessionPanel.displayName = 'SessionPanel';
