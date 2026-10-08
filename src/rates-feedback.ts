import { currenciesFor, getCurrencyQuote, isCurrencyAsset, isStale } from './conversion';
import type { Asset } from './conversion';
import { translator } from './i18n';
import type { MessageKey } from './i18n';
import type { Market } from './market';
import { isGlobalRates } from './rates';
import type { AnyRates } from './rates';
import type { RatesFailure, RatesLoadError } from './rates-client';
import { assetInfo } from './view';
import { STALE_AFTER_MS } from '../shared/snapshot';

const failureMessages: Record<RatesFailure, MessageKey> = {
  offline: 'ratesOffline', network: 'ratesNetwork', timeout: 'ratesTimeout',
  backend: 'ratesBackend', sources: 'sourcesFailed', invalid: 'ratesInvalid',
};

export function ratesFailureMessage(error: RatesLoadError, market: Market): string {
  return translator(market)(failureMessages[error.kind]);
}

export function sourceQuoteWarning(rates: AnyRates | null, source: Asset, market: Market): string {
  if (!rates || !isCurrencyAsset(source) || getCurrencyQuote(rates, source)) return '';
  return translator(market)('sourceQuoteUnavailable', { currency: assetInfo(market)[source].label });
}

/** Rebuild from the retained data so a failed refresh cannot hide existing warnings. */
export function ratesWarnings(rates: AnyRates | null, market: Market, error: RatesLoadError | null = null): string[] {
  const t = translator(market);
  const warnings: string[] = [];
  if (error) warnings.push(ratesFailureMessage(error, market), t(rates ? 'retryWithData' : 'retry'));
  if (!rates) return warnings;
  const timestamps = [rates.fetchedAt, ...(isGlobalRates(rates) ? [rates.ibitUsd] : [rates.cedearArs, rates.cedearUsd, rates.cedearUsdCcl])
    .filter(quote => quote !== null).map(quote => quote.fetchedAt)];
  if (timestamps.some(timestamp => Date.now() - Date.parse(timestamp) > STALE_AFTER_MS)) warnings.push(t('ratesStale'));
  if (isStale(rates.asOf)) warnings.push(t('oldReport'));
  if (isGlobalRates(rates)) {
    if (!rates.ibitUsd) warnings.push(t('globalQuoteUnavailable'));
    else if (Date.now() - Date.parse(rates.ibitUsd.quotedAt) > 7 * 24 * 60 * 60 * 1000) warnings.push(t('oldQuote'));
  } else {
    const info = assetInfo(market);
    const missing = currenciesFor(market).filter(asset => !getCurrencyQuote(rates, asset));
    if (missing.length) warnings.push(t('partialQuotes', { currencies: missing.map(asset => info[asset].label).join(', ') }));
  }
  return warnings;
}
