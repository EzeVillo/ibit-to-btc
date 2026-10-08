import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '../shared/test-fixtures';
import { GLOBAL_SOURCES, SOURCES } from '../src/rates';
import { refreshRates } from './refresh-rates';
import { cloudflareSnapshotStore } from './snapshot-store';

const csv = 'Fund Holdings as of,"Oct 08, 2026"\nShares Outstanding,"100000"\nTicker,Name,Quantity\nBTC,BITCOIN,56';
const html = '<table><tr><td>ISHARES BITCOIN TRUST</td><td></td><td>10:1</td><td></td><td></td><td>IBIT</td><td>IBIT</td></tr></table>';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function providers(fail?: string) {
  vi.stubEnv('FINNHUB_API_KEY', 'private-finnhub-token');
  const fetch = vi.fn(async (url: string) => {
    if (url === fail) return new Response('failure', { status: 429 });
    if (url === SOURCES.holdings) return new Response(csv);
    if (url === SOURCES.cedear) return new Response(html);
    if (url === SOURCES.quotes) return Response.json(['IBIT', 'IBITD', 'IBITC'].map(symbol => ({ symbol, c: 50 })));
    if (url === 'https://finnhub.io/api/v1/quote?symbol=IBIT') return Response.json({ c: 50, t: Math.floor(Date.now() / 1000) });
    throw new Error('Unexpected provider URL');
  });
  vi.stubGlobal('fetch', fetch); return fetch;
}

describe('private refresh cycle', () => {
  it('queries all providers exactly once and writes both markets in one snapshot', async () => {
    const fetch = providers();
    const store = { read: vi.fn().mockResolvedValue(null), write: vi.fn().mockResolvedValue(undefined) };
    const result = await refreshRates(store);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.filter(([url]) => url === GLOBAL_SOURCES.holdings)).toHaveLength(1);
    expect(store.write).toHaveBeenCalledTimes(1);
    expect(result.arUpdated).toBe(true); expect(result.globalUpdated).toBe(true);
    expect(result.snapshot.ar!.cedearRatio).toBe('10:1'); expect(result.snapshot.global!.ibitUsd!.price).toBe('50');
    expect(JSON.stringify(result.snapshot)).not.toContain('private-finnhub-token');
  });
  it('keeps Argentina when Comafi fails while updating the international market', async () => {
    providers(SOURCES.cedear);
    const store = { read: vi.fn().mockResolvedValue(fixture()), write: vi.fn().mockResolvedValue(undefined) };
    const result = await refreshRates(store);
    expect(result.snapshot.ar).toEqual(fixture().ar); expect(result.arUpdated).toBe(false);
    expect(result.globalUpdated).toBe(true);
  });
  it('does not retry Finnhub errors and keeps the previous quote timestamp', async () => {
    const fetch = providers('https://finnhub.io/api/v1/quote?symbol=IBIT');
    const result = await refreshRates({ read: async () => fixture(), write: async () => {} });
    expect(result.snapshot.global!.ibitUsd).toEqual(fixture().global!.ibitUsd);
    expect(result.quotesUpdated.global).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('does not overwrite storage when both essential-source updates fail', async () => {
    providers(SOURCES.holdings);
    const store = { read: vi.fn().mockResolvedValue(fixture()), write: vi.fn() };
    await expect(refreshRates(store)).rejects.toThrow('All source updates failed');
    expect(store.write).not.toHaveBeenCalled();
  });
  it('does not spend provider quota when storage cannot be read', async () => {
    const fetch = providers();
    await expect(refreshRates({ read: async () => { throw new Error('KV failed'); }, write: async () => {} })).rejects.toThrow('KV failed');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('private KV REST credentials and bounded calls', () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_KV_NAMESPACE_ID: 'b'.repeat(32), CLOUDFLARE_KV_API_TOKEN: 'private-kv-token' };
  it('only calls the configured snapshot URL, keeping credentials out of the body and URL', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetch);
    const store = cloudflareSnapshotStore(env);
    expect(await store.read()).toBeNull(); await store.write(fixture());
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${env.CLOUDFLARE_KV_NAMESPACE_ID}/values/rates%3Av1`);
    expect(options.headers.Authorization).toBe('Bearer private-kv-token');
    expect(options.body).not.toContain('private-kv-token'); expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('fails before any sources on invalid configuration', () => {
    expect(() => cloudflareSnapshotStore({ ...env, CLOUDFLARE_KV_NAMESPACE_ID: 'invalid' })).toThrow('Configure Cloudflare');
  });
  it('requires write confirmation and does not retry a failed write', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: false })); vi.stubGlobal('fetch', fetch);
    await expect(cloudflareSnapshotStore(env).write(fixture())).rejects.toThrow('KV did not confirm');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
