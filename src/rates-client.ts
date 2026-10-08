import { validateGlobalRates, validateRates } from './rates';
import type { AnyRates } from './rates';
import type { Market } from './market';
import { ratesEndpoint } from './rates-endpoint';

export type RatesFailure = 'offline' | 'network' | 'timeout' | 'backend' | 'sources' | 'invalid';

export class RatesLoadError extends Error {
  constructor(readonly kind: RatesFailure) {
    super(kind);
    this.name = 'RatesLoadError';
  }
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function transportFailure(error: unknown): RatesLoadError | null {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return new RatesLoadError('timeout');
  if (offline()) return new RatesLoadError('offline');
  if (error instanceof TypeError) return new RatesLoadError('network');
  return null;
}

export async function requestRates(market: Market, basePath = import.meta.env.BASE_URL, gatewayUrl = import.meta.env.VITE_RATES_API_URL): Promise<AnyRates> {
  if (offline()) throw new RatesLoadError('offline');
  let response: Response;
  try {
    response = await fetch(`${ratesEndpoint(gatewayUrl, basePath)}?market=${market}`, {
      credentials: 'omit', signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw transportFailure(error) ?? new RatesLoadError('network');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw transportFailure(error) ?? new RatesLoadError(response.ok ? 'invalid' : 'backend');
  }
  if (!response.ok) {
    const sourceFailure = response.status === 503 && body && typeof body === 'object'
      && 'code' in body && body.code === 'SOURCES_UNAVAILABLE';
    throw new RatesLoadError(sourceFailure ? 'sources' : 'backend');
  }
  try {
    return market === 'ar' ? validateRates(body) : validateGlobalRates(body);
  } catch {
    throw new RatesLoadError('invalid');
  }
}
