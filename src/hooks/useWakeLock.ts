import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      if (!active || cancelled) return;
      if (!('wakeLock' in navigator)) return;
      try {
        const nav = navigator as unknown as {
          wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
        } else {
          sentinelRef.current = sentinel;
        }
      } catch {
        // WakeLock may fail on low battery or unsupported contexts
      }
    }

    function release() {
      if (sentinelRef.current) {
        void sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && active) {
        void acquire();
      }
    };

    if (active) {
      void acquire();
      document.addEventListener('visibilitychange', handleVisibility);
    } else {
      release();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      release();
    };
  }, [active]);
}
