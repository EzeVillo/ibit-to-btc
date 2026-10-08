import { afterEach, describe, expect, it, vi } from 'vitest';
import { ratesWarnings, sourceQuoteWarning, ratesFailureMessage } from './rates-feedback';
import { RatesLoadError } from './rates-client';
import { GLOBAL_SOURCES, SOURCES } from './rates';
import type { GlobalRates, Rates } from './rates';

const ar: Rates = { asOf: '2026-10-05', fetchedAt: '2026-10-06T17:00:00Z', holdingsBtc: '56', sharesOutstanding: '100000',
  cedearsPerShare: '10', cedearRatio: '10:1', cedearArs: null, cedearUsd: null, cedearUsdCcl: null, sources: SOURCES };
const global: GlobalRates = { ...ar, market: 'global', ibitUsd: null, quoteStatus: 'unavailable', sources: GLOBAL_SOURCES };
afterEach(() => vi.useRealTimers());

describe('actionable rates feedback', () => {
  it('warns about retained quotes even when the fund was refreshed successfully', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T18:00:00Z'));
    const data = { ...ar, fetchedAt: '2026-10-06T18:00:00Z', cedearUsd: { price: '50', fetchedAt: ar.fetchedAt } };
    expect(ratesWarnings(data, 'ar').join(' ')).toContain('actualización reciente');
    expect(ratesWarnings({ ...data, cedearUsd: { price: '50', fetchedAt: data.fetchedAt } }, 'ar').join(' ')).not.toContain('actualización reciente');
  });
  it('identifies the missing Argentine currencies', () => {
    const warnings = ratesWarnings({ ...ar, cedearArs: { price: '5000', fetchedAt: ar.fetchedAt } }, 'ar');
    expect(warnings.join(' ')).toContain('USD MEP, USD CCL');
    expect(warnings.join(' ')).toContain('Podés seguir');
  });
  it('explains how to continue when the selected currency loses its quote', () => {
    expect(sourceQuoteWarning(ar, 'usd', 'ar')).toContain('USD MEP');
    expect(sourceQuoteWarning(ar, 'usd', 'ar')).toContain('otro origen');
    expect(sourceQuoteWarning(ar, 'usd', 'ar')).toContain('Actualizar');
    expect(sourceQuoteWarning(ar, 'usd', 'ar')).toContain('importe');
    expect(sourceQuoteWarning(global, 'usd', 'global')).toContain('another available source');
  });
  it('clears the source warning on recovery or when choosing an available asset', () => {
    expect(sourceQuoteWarning({ ...ar, cedearUsd: { price: '5', fetchedAt: ar.fetchedAt } }, 'usd', 'ar')).toBe('');
    expect(sourceQuoteWarning(ar, 'btc', 'ar')).toBe('');
    expect(sourceQuoteWarning(null, 'usd', 'global')).toBe('');
  });
  it('preserves old-report and missing-quote warnings alongside a refresh error', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const warnings = ratesWarnings(ar, 'ar', new RatesLoadError('backend'));
    expect(warnings.join(' ')).toContain('servidor');
    expect(warnings.join(' ')).toContain('seguir');
    expect(warnings.join(' ')).toContain('más de 7 días');
    expect(warnings.join(' ')).toContain('USD CCL');
  });
  it('keeps the timestamp warning for an old USD quote after a failed refresh', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const rates = { ...global, quoteStatus: 'available' as const, ibitUsd: { price: '50', fetchedAt: global.fetchedAt, quotedAt: global.fetchedAt } };
    expect(ratesWarnings(rates, 'global', new RatesLoadError('network')).join(' ')).toContain('quote is more than 7 days old');
  });
  it('explains that entering values is allowed but results need source data', () => {
    expect(ratesWarnings(null, 'ar', new RatesLoadError('offline')).join(' ')).toContain('Podés ingresar');
    expect(ratesWarnings(null, 'global', new RatesLoadError('offline')).join(' ')).toContain('enter amounts');
  });
  it('uses a distinct localized message for every failure type', () => {
    const kinds = ['offline', 'network', 'timeout', 'backend', 'sources', 'invalid'] as const;
    for (const market of ['ar', 'global'] as const) expect(new Set(kinds.map(kind => ratesFailureMessage(new RatesLoadError(kind), market))).size).toBe(kinds.length);
  });
});
