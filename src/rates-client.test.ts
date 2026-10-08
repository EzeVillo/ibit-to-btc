import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestRates } from './rates-client';
import { GLOBAL_SOURCES, SOURCES } from './rates';

const fund = { asOf: '2026-10-05', fetchedAt: '2026-10-06T17:00:00Z', holdingsBtc: '56', sharesOutstanding: '100000' };
const ar = { ...fund, cedearsPerShare: '10', cedearRatio: '10:1', cedearArs: null, cedearUsd: null, cedearUsdCcl: null, sources: SOURCES };
const global = { ...fund, market: 'global', ibitUsd: null, quoteStatus: 'unavailable', sources: GLOBAL_SOURCES };

beforeEach(() => {
  vi.stubEnv('BASE_URL', '/');
  vi.stubEnv('VITE_RATES_API_URL', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('loading rates in the browser', () => {
  it('requests quotes below the project prefix without using a shared root API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(global));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestRates('global', '/ibit-to-btc/')).toEqual(global);
    expect(fetchMock).toHaveBeenCalledWith('/ibit-to-btc/api/rates?market=global', expect.any(Object));
  });
  it.each([['ar', ar], ['global', global]] as const)('accepts validated partial data for %s', async (market, data) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestRates(market)).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(`/api/rates?market=${market}`, expect.objectContaining({ credentials: 'omit', signal: expect.any(AbortSignal) }));
  });
  it('calls Cloudflare directly without browser credentials or a Netlify proxy', async () => {
    vi.stubEnv('VITE_RATES_API_URL', 'https://gateway.workers.dev/ibit-to-btc/api/rates');
    const fetchMock = vi.fn().mockResolvedValue(Response.json(global)); vi.stubGlobal('fetch', fetchMock);
    await requestRates('global', '/ibit-to-btc/');
    expect(fetchMock).toHaveBeenCalledWith('https://gateway.workers.dev/ibit-to-btc/api/rates?market=global', expect.objectContaining({ credentials: 'omit' }));
  });
  it('reports a lost connection without claiming the server is down', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'network' });
  });
  it('reports offline before starting a request', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['TimeoutError', 'AbortError'])('reports %s as a timeout', async name => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Expired', name)));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('uses the structured source failure code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'SOURCES_UNAVAILABLE', error: 'Private provider details' }, { status: 503 })));
    await expect(requestRates('global')).rejects.toMatchObject({ kind: 'sources' });
  });
  it.each([500, 502, 503, 504, 404, 429])('reports HTTP %s as a server failure even with an HTML response', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Hosting error</html>', { status })));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'backend' });
  });
  it('does not trust an arbitrary server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '<script>secret</script>' }, { status: 500 })));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'backend', message: 'backend' });
  });
  it.each(['not JSON', JSON.stringify({ ...ar, holdingsBtc: '0' }), JSON.stringify({ ...ar, sources: {} })])('rejects malformed or invalid successful responses', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('does not report a body timeout as invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new DOMException('Expired', 'TimeoutError')) }));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'timeout' });
  });
  it.each([['ar', global], ['global', ar]] as const)('rejects a response from the other market when requesting %s', async (market, data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    await expect(requestRates(market)).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('rejects an international discriminator mixed into an otherwise Argentine response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...ar, market: 'global' })));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('reports a connection lost while reading the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new TypeError('Connection lost')) }));
    await expect(requestRates('ar')).rejects.toMatchObject({ kind: 'network' });
  });
});
