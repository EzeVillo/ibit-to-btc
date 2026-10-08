import { pathWithinApp } from './app-path.ts';

export type Market = 'ar' | 'global';

/** An explicit URL always determines the market, regardless of browser language. */
export function marketFromPath(path: string, basePath = '/'): Market {
  const localPath = pathWithinApp(path, basePath);
  return localPath === '/ar' || localPath?.startsWith('/ar/') ? 'ar' : 'global';
}

export function localeFor(market: Market): string {
  return market === 'ar' ? 'es-AR' : 'en-US';
}

export function decimalSeparator(market: Market): ',' | '.' {
  return market === 'ar' ? ',' : '.';
}
