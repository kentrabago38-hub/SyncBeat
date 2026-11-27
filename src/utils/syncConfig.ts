export function getSyncServerOrigin(): string {
  const raw = import.meta.env.VITE_SYNC_SERVER_URL as string | undefined;
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
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
