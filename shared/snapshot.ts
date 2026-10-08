import { validateGlobalRates, validateRates } from '../src/rates.ts';
import type { GlobalRates, Rates } from '../src/rates.ts';

export const SNAPSHOT_KEY = 'rates:v1';
export const SNAPSHOT_CACHE_MS = 30_000;
export const RETRY_MS = 60_000;
export const STALE_AFTER_MS = 30 * 60_000;

export interface RatesSnapshot {
  version: 1;
  ar: Rates | null;
  global: GlobalRates | null;
}

export function validateSnapshot(value: unknown): RatesSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid rates snapshot.');
  const data = value as Partial<RatesSnapshot>;
  if (data.version !== 1 || data.ar === undefined || data.global === undefined) throw new Error('Invalid rates snapshot version.');
  return { version: 1, ar: data.ar === null ? null : validateRates(data.ar),
    global: data.global === null ? null : validateGlobalRates(data.global) };
}

/** Keep each last valid quote with its original timestamp, never mark it as newly fetched. */
export function mergeSnapshot(previous: RatesSnapshot | null, ar: Rates | null, global: GlobalRates | null): RatesSnapshot {
  const oldAr = previous?.ar;
  const oldGlobal = previous?.global;
  return validateSnapshot({ version: 1,
    ar: ar ? { ...ar, cedearArs: ar.cedearArs ?? oldAr?.cedearArs ?? null,
      cedearUsd: ar.cedearUsd ?? oldAr?.cedearUsd ?? null,
      cedearUsdCcl: ar.cedearUsdCcl ?? oldAr?.cedearUsdCcl ?? null } : oldAr ?? null,
    global: global ? { ...global, ibitUsd: global.ibitUsd ?? oldGlobal?.ibitUsd ?? null,
      quoteStatus: global.ibitUsd || oldGlobal?.ibitUsd ? 'available' : global.quoteStatus } : oldGlobal ?? null,
  });
}
