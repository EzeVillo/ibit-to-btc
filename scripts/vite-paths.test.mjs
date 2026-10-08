import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

describe('Vite HTML below the application prefix', () => {
  it('serves the theme, favicon and both markets with exactly one base prefix', async () => {
    vi.stubEnv('APP_BASE_PATH', '/ibit-to-btc/');
    const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
    try {
      await server.listen();
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const [path, language] of [['/ibit-to-btc/', 'en'], ['/ibit-to-btc/ar/', 'es-AR']]) {
        const page = await (await fetch(origin + path)).text();
        expect(page).toContain(`<html lang="${language}"`);
        expect(page).toContain('src="/ibit-to-btc/theme.js"');
        expect(page).toContain('href="/ibit-to-btc/favicon.svg"');
        expect(page).not.toContain('/ibit-to-btc/ibit-to-btc/');
      }
      const theme = await fetch(origin + '/ibit-to-btc/theme.js');
      expect(theme.status).toBe(200);
      expect(await theme.text()).toBe(await readFile(new URL('../public/theme.js', import.meta.url), 'utf8'));
      const invalidQuery = await fetch(origin + '/ibit-to-btc/api/rates?market=invalid');
      expect(invalidQuery.status).toBe(400);
      expect(await invalidQuery.json()).toMatchObject({ code: 'INVALID_MARKET' });
      const post = await fetch(origin + '/ibit-to-btc/api/rates', { method: 'POST' });
      expect(post.status).toBe(405);
      expect(post.headers.get('allow')).toBe('GET');
    } finally { await server.close(); }
  });
});
