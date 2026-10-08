import { apiError, requestMarket, snapshotResponse } from '../shared/rates-http.ts';
import { validateSnapshot } from '../shared/snapshot.ts';

export interface GatewayServices {
  apiPath: string;
  allowedOrigin: string;
  limit(ip: string): Promise<{ success: boolean }>;
  readSnapshot(): Promise<unknown>;
  cache: Pick<Cache, 'match' | 'put'>;
  waitUntil(promise: Promise<unknown>): void;
}

export async function handleGateway(request: Request, services: GatewayServices): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== services.apiPath) return apiError(404, 'NOT_FOUND');
  const origin = request.headers.get('Origin');
  if (origin && origin !== services.allowedOrigin) return apiError(403, 'ORIGIN_NOT_ALLOWED');
  const respond = (response: Response) => {
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', services.allowedOrigin);
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
  };
  const market = request.method === 'OPTIONS' ? 'ar' : requestMarket(request);
  if (market instanceof Response) return respond(market);
  try {
    // This header is provided by Cloudflare, never by application query parameters.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await services.limit(ip)).success) return respond(apiError(429, 'RATE_LIMITED', { 'Retry-After': '60' }));
    if (request.method === 'OPTIONS') {
      return respond(new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store',
      } }));
    }
    // Strip client headers and normalize selectors: requests cannot bypass or fragment the cache.
    const key = new Request(`${url.origin}${services.apiPath}?market=${market}`);
    const cached = await services.cache.match(key);
    if (cached) return respond(cached);
    const snapshot = validateSnapshot(await services.readSnapshot());
    const response = snapshotResponse(snapshot, market);
    if (response.ok) services.waitUntil(services.cache.put(key, response.clone()).catch(() => {}));
    return respond(response);
  } catch {
    // No origin/backend fallback, including when Cloudflare storage or bindings hit a quota.
    return respond(apiError(503, 'SOURCES_UNAVAILABLE', { 'Retry-After': '60' }));
  }
}
