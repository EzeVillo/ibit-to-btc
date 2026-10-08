import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGlobalRates, parseIbitQuote } from './sources';
import { SOURCES } from '../src/rates';

const fetchedAt = '2026-10-06T17:00:00Z';
const timestamp = Date.parse('2026-10-06T16:59:00Z') / 1000;
const csv = `Fund Holdings as of,"Oct 05, 2026"\nShares Outstanding,"100000"\nTicker,Name,Quantity\nBTC,BITCOIN,56`;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Finnhub quote parsing', () => {
  it('uses c as the share price and t as the market timestamp, separately from retrieval time', () => {
    expect(parseIbitQuote({ c: 50.12, t: timestamp, pc: 48 }, fetchedAt)).toEqual({ price: '50.12', quotedAt: '2026-10-06T16:59:00.000Z', fetchedAt });
  });
  it.each([null, [], { c: 0, t: timestamp }, { c: -5, t: timestamp }, { c: '50', t: timestamp }, { c: Infinity, t: timestamp }, { c: 50 }, { c: 50, t: 0 }, { c: 50, t: timestamp + 86400 }, { c: 50, t: timestamp + 0.5 }, { error: 'Invalid API key' }])('rejects %j instead of inventing a price', value => {
    expect(() => parseIbitQuote(value, fetchedAt)).toThrow();
  });
});

describe('global source isolation', () => {
  it('requests only the fund report and fixed IBIT API symbol; sends the key only in a header', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === SOURCES.holdings) return new Response(csv);
      expect(url).toBe('https://finnhub.io/api/v1/quote?symbol=IBIT');
      expect(options?.headers).toMatchObject({ 'X-Finnhub-Token': 'test-key' });
      return Response.json({ c: 50, t: Math.floor(Date.now() / 1000) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchGlobalRates();
    expect(data.ibitUsd!.price).toBe('50'); expect(data.quoteStatus).toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(data)).not.toContain('test-key'); expect(JSON.stringify(data)).not.toContain('Comafi');
  });
  it.each([429, 403, 500])('retains fund conversions when the quote API returns HTTP %s', async status => {
    vi.stubEnv('FINNHUB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === SOURCES.holdings ? new Response(csv) : new Response('API error', { status })));
    const data = await fetchGlobalRates(); expect(data.ibitUsd).toBeNull(); expect(data.quoteStatus).toBe('unavailable'); expect(data.holdingsBtc).toBe('56');
  });
  it('reports a missing configuration and makes no unauthenticated quote request', async () => {
    vi.stubEnv('FINNHUB_API_KEY', ''); const fetchMock = vi.fn(async () => new Response(csv)); vi.stubGlobal('fetch', fetchMock);
    const data = await fetchGlobalRates(); expect(data.quoteStatus).toBe('not_configured'); expect(data.ibitUsd).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails explicitly if the essential fund report fails, regardless of the quote', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'test-key'); vi.stubGlobal('fetch', vi.fn(async (url: string) => url === SOURCES.holdings ? new Response('Unavailable', { status: 500 }) : Response.json({ c: 50, t: Math.floor(Date.now() / 1000) })));
    await expect(fetchGlobalRates()).rejects.toThrow();
  });
});
