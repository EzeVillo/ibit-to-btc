import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '../shared/test-fixtures';

const read = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ readFile: read }));
afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); read.mockReset(); });

describe('local snapshot-only API', () => {
  it('100 simultaneous requests read the file once without contacting providers', async () => {
    read.mockResolvedValue(JSON.stringify(fixture()));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { handleLocalRates } = await import('./local-rates');
    const responses = await Promise.all(Array.from({ length: 100 }, () => handleLocalRates(new Request('http://localhost/api/rates?market=global'))));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not invent or fetch initial data when no snapshot exists', async () => {
    read.mockRejectedValue(new Error('ENOENT'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { handleLocalRates } = await import('./local-rates');
    const response = await handleLocalRates(new Request('http://localhost/api/rates'));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'SOURCES_UNAVAILABLE' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
