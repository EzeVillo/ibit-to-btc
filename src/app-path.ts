export const DEFAULT_BASE_PATH = '/ibit-to-btc/';

/** A local directory prefix, never a URL or a filesystem traversal. */
export function normalizeBasePath(value: string = DEFAULT_BASE_PATH): string {
  let path = value.trim() || DEFAULT_BASE_PATH;
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path += '/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(path)) {
    throw new Error('APP_BASE_PATH must be / or a local path such as /ibit-to-btc/.');
  }
  return path;
}

export function appPath(basePath: string, path = ''): string {
  return normalizeBasePath(basePath) + path.replace(/^\/+/, '');
}

export function pathWithinApp(path: string, basePath: string): string | null {
  const base = normalizeBasePath(basePath);
  if (base === '/') return path;
  if (path === base.slice(0, -1)) return '/';
  return path.startsWith(base) ? `/${path.slice(base.length)}` : null;
}
