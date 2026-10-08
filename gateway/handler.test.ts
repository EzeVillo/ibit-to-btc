import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGateway } from './handler';
import { fixture } from '../shared/test-fixtures';
import { SnapshotCache } from '../shared/snapshot-cache';

function services() {
  return { apiPath: '/ibit-to-btc/api/rates', allowedOrigin: 'https://ezevillo.com',
    limit: vi.fn().mockResolvedValue({ success: true }), readSnapshot: vi.fn().mockResolvedValue(fixture()),
    cache: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) },
    waitUntil: vi.fn(),
  };
}
const request = (query = '', headers: Record<string, string> = {}, method = 'GET') => new Request(`https://gateway.test/ibit-to-btc/api/rates${query}`,
  { method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('public read-only gateway', () => {
  it('100 cold requests for both markets share one KV read and never fetch providers', async () => {
    const read = vi.fn().mockResolvedValue(fixture());
    const coordinator = new SnapshotCache(read);
    const options = services();
    options.readSnapshot.mockImplementation(() => coordinator.get());
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const responses = await Promise.all(Array.from({ length: 100 }, (_, i) => handleGateway(request(`?market=${i % 2 ? 'ar' : 'global'}`), options)));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(await responses[0].json()).toEqual(fixture().global);
    expect(await responses[1].json()).toEqual(fixture().ar);
  });
  it('normalizes the default market and drops request headers from cache keys', async () => {
    const options = services();
    await handleGateway(request('', { 'Cache-Control': 'no-cache', Cookie: 'anything' }), options);
    const key = options.cache.match.mock.calls[0][0] as Request;
    expect(key.url).toBe('https://gateway.test/ibit-to-btc/api/rates?market=ar');
    expect([...key.headers]).toEqual([]);
  });
  it('returns an edge-cached response without invoking the coordinator', async () => {
    const options = services(); options.cache.match.mockResolvedValue(Response.json(fixture().global));
    const response = await handleGateway(request('?market=global', { Origin: 'https://ezevillo.com' }), options);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ezevillo.com');
    expect(options.readSnapshot).not.toHaveBeenCalled();
  });
  it.each(['?market=other', '?market=ar&market=global', '?market=global&bust=1', '?url=https://attacker.test'])('rejects %s before storage access', async query => {
    const options = services();
    expect((await handleGateway(request(query), options)).status).toBe(400);
    expect(options.readSnapshot).not.toHaveBeenCalled();
  });
  it('limits both cached and uncached traffic before any reads', async () => {
    const options = services(); options.limit.mockResolvedValue({ success: false });
    const response = await handleGateway(request(), options);
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('60');
    expect(options.cache.match).not.toHaveBeenCalled(); expect(options.readSnapshot).not.toHaveBeenCalled();
  });
  it('returns safe failures without a fallback to any backend or data provider', async () => {
    const options = services(); options.readSnapshot.mockRejectedValue(new Error('Bearer PRIVATE_TOKEN'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await handleGateway(request(), options);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'SOURCES_UNAVAILABLE' });
    expect(options.cache.put).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('allows preflight without exposing data and rejects other origins', async () => {
    const options = services();
    const response = await handleGateway(request('', { Origin: 'https://ezevillo.com' }, 'OPTIONS'), options);
    expect(response.status).toBe(204); expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET');
    expect((await handleGateway(request('', { Origin: 'https://attacker.test' }), options)).status).toBe(403);
    expect(options.readSnapshot).not.toHaveBeenCalled();
  });
  it('rejects update methods and unrelated routes', async () => {
    const options = services();
    expect((await handleGateway(request('', {}, 'POST'), options)).status).toBe(405);
    expect((await handleGateway(new Request('https://gateway.test/update'), options)).status).toBe(404);
    expect(options.readSnapshot).not.toHaveBeenCalled();
  });
});
