import type { Market } from '../src/market.ts';
import type { RatesSnapshot } from './snapshot.ts';

export function apiError(status: number, code: string, extraHeaders: Record<string, string> = {}): Response {
  return Response.json({ code }, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders,
  } });
}

export function requestMarket(request: Request): Market | Response {
  if (request.method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', { Allow: 'GET' });
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? 'ar';
  if ((market !== 'ar' && market !== 'global') || params.getAll('market').length > 1
    || [...params.keys()].some(key => key !== 'market')) return apiError(400, 'INVALID_MARKET');
  return market;
}

export function snapshotResponse(snapshot: RatesSnapshot, market: Market): Response {
  const data = snapshot[market];
  if (!data) return apiError(503, 'SOURCES_UNAVAILABLE', { 'Retry-After': '60' });
  return Response.json(data, { headers: {
    'Cache-Control': 'public, max-age=30', 'X-Content-Type-Options': 'nosniff',
  } });
}
