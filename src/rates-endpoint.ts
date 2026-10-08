import { appPath } from './app-path.ts';

/** Public gateway URL only; credentials, selectors and fragments never belong in this setting. */
export function ratesEndpoint(value: string | undefined, basePath: string): string {
  if (!value?.trim()) return appPath(basePath, 'api/rates');
  const url = new URL(value.trim());
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith('/api/rates')) throw new Error('VITE_RATES_API_URL must be the public HTTPS gateway /api/rates URL.');
  return url.href;
}
