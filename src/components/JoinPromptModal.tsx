import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { MUSICIAN_ROLES } from '../constants/metronomeData';
import { MusicianRole, TimeSignature } from '../types/metronome';
import { apiUrl } from '../utils/syncConfig';
import { SyncBeatLogo } from './SyncBeatLogo';

interface SessionPreview {
  sessionId: string;
  name: string;
  hostName: string;
  hostRole: MusicianRole;
  bpm: number;
  timeSignature: TimeSignature;
  participantCount: number;
  isLocked: boolean;
}

interface JoinPromptModalProps {
  code: string;
  onJoin: (opts: { code: string; name: string; role: MusicianRole }) => Promise<unknown>;
  onDismiss: () => void;
}

export const JoinPromptModal: React.FC<JoinPromptModalProps> = ({
  code,
  onJoin,
  onDismiss,
}) => {
  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<MusicianRole>('Guitar');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/sessions/${encodeURIComponent(code.toUpperCase())}`))
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || 'Session not found or expired');
        }
        return (await res.json()) as SessionPreview;
      })
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load session');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setError(null);
    try {
      await onJoin({
        code,
        name: name.trim() || role,
        role,
      });
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join session');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
      <div className="scroll-touch pb-safe w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#12141A] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5 text-xs font-mono-tabular font-semibold uppercase tracking-wider text-amber-400">
            <SyncBeatLogo variant="icon" className="w-7 h-7" />
            <span>Join Rehearsal · {code.toUpperCase()}</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-zinc-400">
            Looking up session <span className="font-mono-tabular text-white">{code}</span>...
          </div>
        ) : error && !preview ? (
          <div className="py-6 space-y-4">
            <p className="text-sm text-rose-300">{error}</p>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white"
            >
              Continue in Solo Mode
            </button>
          </div>
        ) : preview ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#181B23] p-4">
              <h2 className="font-display text-xl font-bold text-white">{preview.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono-tabular text-amber-400 font-semibold">
                  {preview.bpm} BPM
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {preview.timeSignature.numerator}/{preview.timeSignature.denominator}
                </span>
                <span aria-hidden="true">·</span>
                <span>Host: {preview.hostRole}</span>
                <span aria-hidden="true">·</span>
                <span>{preview.participantCount} connected</span>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Select Your Instrument / Role
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {MUSICIAN_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-lg py-2 px-2 text-xs font-medium transition ${
                      role === r
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'bg-[#181B23] text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. ${role} Player`}
                maxLength={32}
                className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600"
              />
            </div>

            <button
              type="submit"
              disabled={joining || preview.isLocked}
              className="w-full h-12 rounded-xl bg-amber-500 font-display text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition"
            >
              {preview.isLocked
                ? 'Session Locked by Host'
                : joining
                ? 'Connecting...'
                : 'Join Session'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
};
