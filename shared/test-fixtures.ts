import { GLOBAL_SOURCES, SOURCES } from '../src/rates.ts';
import type { RatesSnapshot } from './snapshot.ts';

export function fixture(): RatesSnapshot {
  const fund = { asOf: '2026-10-08', fetchedAt: '2026-10-08T17:00:00Z', holdingsBtc: '56', sharesOutstanding: '100000' };
  const quote = { price: '50', fetchedAt: fund.fetchedAt };
  return { version: 1,
    ar: { ...fund, cedearRatio: '10:1', cedearsPerShare: '10', cedearArs: quote, cedearUsd: quote, cedearUsdCcl: quote, sources: SOURCES },
    global: { ...fund, market: 'global', ibitUsd: { ...quote, quotedAt: fund.fetchedAt }, quoteStatus: 'available', sources: GLOBAL_SOURCES },
  };
}
