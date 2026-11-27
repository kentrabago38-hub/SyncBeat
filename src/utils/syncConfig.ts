const CUSTOM_ORIGIN_KEY = 'syncbeat:syncOriginOverride:v1';

export function getCustomSyncOrigin(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(CUSTOM_ORIGIN_KEY);
    if (!raw) return '';
    return raw.trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function setCustomSyncOrigin(url: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = url ? url.trim().replace(/\/+$/, '') : '';
    if (!cleaned) {
      window.localStorage.removeItem(CUSTOM_ORIGIN_KEY);
    } else {
      window.localStorage.setItem(CUSTOM_ORIGIN_KEY, cleaned);
    }
  } catch {
    // ignore storage errors
  }
}

export function getSyncServerOrigin(): string {
  const custom = getCustomSyncOrigin();
  if (custom) return custom;
  const raw = import.meta.env.VITE_SYNC_SERVER_URL as string | undefined;
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

export function getEffectiveShareOrigin(): string {
  const origin = getSyncServerOrigin();
  if (origin) return origin;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function apiUrl(path: string): string {
  const origin = getSyncServerOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}

export function getWsUrl(): string {
  const origin = getSyncServerOrigin();
  if (origin) {
    const wsOrigin = origin.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return `${wsOrigin}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
