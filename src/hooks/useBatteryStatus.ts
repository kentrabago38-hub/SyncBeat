import { useEffect, useState } from 'react';

interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => unknown) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => unknown) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => unknown) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => unknown) | null;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
  standalone?: boolean;
}

export interface BatteryStatusState {
  isPWA: boolean;
  supported: boolean;
  levelPercent: number | null;
  charging: boolean;
  dischargingTimeSec: number | null;
}

function detectPWAMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as NavigatorWithBattery;
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia === 'function') {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches
    );
  }
  return false;
}

export function useBatteryStatus(): BatteryStatusState {
  const [isPWA, setIsPWA] = useState<boolean>(() => detectPWAMode());
  const [supported, setSupported] = useState<boolean>(false);
  const [levelPercent, setLevelPercent] = useState<number | null>(null);
  const [charging, setCharging] = useState<boolean>(false);
  const [dischargingTimeSec, setDischargingTimeSec] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePWA = () => setIsPWA(detectPWAMode());
    updatePWA();

    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    mql?.addEventListener?.('change', updatePWA);
    window.addEventListener('appinstalled', updatePWA);

    return () => {
      mql?.removeEventListener?.('change', updatePWA);
      window.removeEventListener('appinstalled', updatePWA);
    };
  }, []);

  useEffect(() => {
    if (!isPWA || typeof navigator === 'undefined') {
      return;
    }

    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') {
      setSupported(false);
      return;
    }

    let active = true;
    let manager: BatteryManager | null = null;

    const syncFromManager = (bm: BatteryManager) => {
      if (!active) return;
      const pct = Math.max(0, Math.min(100, Math.round(bm.level * 100)));
      setSupported(true);
      setLevelPercent(pct);
      setCharging(Boolean(bm.charging));
      setDischargingTimeSec(
        Number.isFinite(bm.dischargingTime) && bm.dischargingTime > 0 ? bm.dischargingTime : null
      );
    };

    const handleChange = () => {
      if (manager) syncFromManager(manager);
    };

    nav
      .getBattery()
      .then((bm) => {
        if (!active) return;
        manager = bm;
        syncFromManager(bm);
        bm.addEventListener('levelchange', handleChange);
        bm.addEventListener('chargingchange', handleChange);
        bm.addEventListener('dischargingtimechange', handleChange);
      })
      .catch(() => {
        if (active) setSupported(false);
      });

    return () => {
      active = false;
      if (manager) {
        manager.removeEventListener('levelchange', handleChange);
        manager.removeEventListener('chargingchange', handleChange);
        manager.removeEventListener('dischargingtimechange', handleChange);
      }
    };
  }, [isPWA]);

  return {
    isPWA,
    supported,
    levelPercent,
    charging,
    dischargingTimeSec,
  };
}
