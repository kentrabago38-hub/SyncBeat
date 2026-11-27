import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import React from 'react';
import { ConnectionQuality } from '../types/metronome';

interface ConnectionBadgeProps {
  quality: ConnectionQuality;
  latencyMs: number;
  isWireless: boolean;
  reconnecting?: boolean;
  compact?: boolean;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  quality,
  latencyMs,
  isWireless,
  reconnecting,
  compact = false,
}) => {
  if (!isWireless) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
        <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-500" aria-hidden="true" />
        <span className="font-medium text-slate-700 dark:text-zinc-300">Solo Mode</span>
      </div>
    );
  }

  const config: Record<
    ConnectionQuality,
    { label: string; colorClass: string; Icon: React.FC<{ className?: string }> }
  > = {
    synced: {
      label: 'SYNCED',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      Icon: CheckCircle2,
    },
    syncing: {
      label: reconnecting ? 'RESYNCING...' : 'SYNCING...',
      colorClass: 'text-amber-600 dark:text-amber-400',
      Icon: ({ className }) => <Loader2 className={`${className ?? ''} animate-spin`} />,
    },
    unstable: {
      label: 'UNSTABLE',
      colorClass: 'text-orange-600 dark:text-orange-400',
      Icon: AlertTriangle,
    },
    offline: {
      label: reconnecting ? 'RECONNECTING...' : 'OFFLINE',
      colorClass: 'text-rose-600 dark:text-rose-400',
      Icon: WifiOff,
    },
  };

  const current = config[quality];
  const Icon = current.Icon;

  return (
    <div
      className="inline-flex items-center gap-2 text-xs whitespace-nowrap shrink-0"
      role="status"
      aria-live="polite"
    >
      <Icon className={`w-3.5 h-3.5 ${current.colorClass}`} />
      <span className={`font-mono-tabular font-semibold tracking-wide ${current.colorClass}`}>
        {current.label}
      </span>
      {!compact && quality !== 'offline' && (
        <>
          <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>
          <span className="font-mono-tabular text-slate-500 dark:text-zinc-400">{latencyMs} ms</span>
        </>
      )}
    </div>
  );
};
