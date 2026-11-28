import {
  AlertTriangle,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  CheckCircle2,
  Loader2,
  WifiOff,
} from 'lucide-react';
import React from 'react';
import { useBatteryStatus } from '../hooks/useBatteryStatus';
import { ConnectionQuality } from '../types/metronome';

interface ConnectionBadgeProps {
  quality: ConnectionQuality;
  latencyMs: number;
  isWireless: boolean;
  reconnecting?: boolean;
  compact?: boolean;
  meshPeers?: number;
}

function formatRemainingTime(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const totalMins = Math.round(seconds / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return ` (~${hours}h ${mins}m)`;
  return ` (~${mins}m)`;
}

const BatteryIndicator: React.FC = () => {
  const { supported, levelPercent, charging, chargingTimeSec, dischargingTimeSec, isLowBattery } =
    useBatteryStatus();

  if (!supported || levelPercent === null) {
    return null;
  }

  let BatteryIcon = BatteryFull;
  let toneClass = 'text-slate-600 dark:text-zinc-300';

  if (charging) {
    BatteryIcon = BatteryCharging;
    toneClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (levelPercent <= 15) {
    BatteryIcon = BatteryWarning;
    toneClass = 'text-rose-600 dark:text-rose-400';
  } else if (levelPercent <= 25) {
    BatteryIcon = BatteryLow;
    toneClass = 'text-amber-600 dark:text-amber-400';
  } else if (levelPercent <= 65) {
    BatteryIcon = BatteryMedium;
    toneClass = 'text-slate-600 dark:text-zinc-300';
  } else {
    BatteryIcon = BatteryFull;
    toneClass = 'text-emerald-600 dark:text-emerald-400';
  }

  const timeDetail = charging
    ? chargingTimeSec
      ? ` · Full in${formatRemainingTime(chargingTimeSec)}`
      : ' · Charging'
    : dischargingTimeSec
    ? `${formatRemainingTime(dischargingTimeSec)} remaining`
    : isLowBattery
    ? ' · Low battery'
    : '';

  const title = `Device battery: ${levelPercent}%${timeDetail}`;

  return (
    <>
      <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">
        ·
      </span>
      <span
        className={`inline-flex items-center gap-1 font-mono-tabular font-semibold ${toneClass}`}
        title={title}
        aria-label={title}
      >
        <BatteryIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{levelPercent}%</span>
      </span>
    </>
  );
};

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  quality,
  latencyMs,
  isWireless,
  reconnecting,
  compact = false,
  meshPeers = 0,
}) => {
  if (!isWireless) {
    return (
      <div className="inline-flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
        <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-500" aria-hidden="true" />
        <span className="font-medium text-slate-700 dark:text-zinc-300">Solo Mode</span>
        {!compact && <BatteryIndicator />}
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
      className="inline-flex items-center gap-1.5 sm:gap-2 text-xs whitespace-nowrap shrink-0"
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
      {!compact && meshPeers > 0 && (
        <>
          <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>
          <span
            className="font-mono-tabular font-medium text-emerald-600 dark:text-emerald-400"
            title={`${meshPeers} direct peer-to-peer stage relay ${meshPeers === 1 ? 'link' : 'links'} active`}
          >
            Mesh {meshPeers}
          </span>
        </>
      )}
      {!compact && <BatteryIndicator />}
    </div>
  );
};
