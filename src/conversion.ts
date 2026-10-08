import Decimal from 'decimal.js';
import type { Rates } from './rates';
import { isGlobalRates } from './rates';
import type { AnyRates } from './rates';
import { decimalSeparator } from './market';
import type { Market } from './market';
import { translator } from './i18n';
import { parseNumericInput } from './numeric-input';
import type { NumericInputRules } from './numeric-input';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export type Asset = 'cedear' | 'ibit' | 'btc' | 'sats' | 'usd' | 'usd_ccl' | 'ars';
export type CurrencyAsset = 'usd' | 'usd_ccl' | 'ars';
export type Amounts = Record<Asset, Decimal | null>;
export interface MonetaryRounding {
  theoreticalCedears: Decimal;
  cedears: Decimal;
  total: Decimal;
  difference: Decimal;
  direction: 'up' | 'down' | 'exact';
}
export const assets: Asset[] = ['cedear', 'ibit', 'btc', 'sats', 'ars', 'usd', 'usd_ccl'];
export const currencyAssets: CurrencyAsset[] = ['ars', 'usd', 'usd_ccl'];
export function assetsFor(market: Market): Asset[] {
  return market === 'ar' ? assets : ['ibit', 'btc', 'sats', 'usd'];
}
export function currenciesFor(market: Market): CurrencyAsset[] {
  return market === 'ar' ? currencyAssets : ['usd'];
}
export const MAX_AMOUNT = new Decimal('1000000000000');
export const MAX_BTC_AMOUNT = new Decimal('21000000');
export const SATOSHIS_PER_BTC = new Decimal('100000000');
export const MAX_SATS_AMOUNT = MAX_BTC_AMOUNT.mul(SATOSHIS_PER_BTC);
export const BTC_DECIMAL_PLACES = 8;
export const AMOUNT_DECIMAL_PLACES = 2;

export function getMaxAmount(asset: Asset): Decimal {
  return asset === 'btc' ? MAX_BTC_AMOUNT : asset === 'sats' ? MAX_SATS_AMOUNT : MAX_AMOUNT;
}

export function inputDecimalPlaces(asset: Asset, market: Market = 'ar'): number {
  return asset === 'cedear' || asset === 'sats' || (market === 'global' && asset === 'ibit') ? 0 : asset === 'btc' ? BTC_DECIMAL_PLACES : AMOUNT_DECIMAL_PLACES;
}

export function isCurrencyAsset(asset: Asset): asset is CurrencyAsset {
  return currencyAssets.includes(asset as CurrencyAsset);
}

export function getCurrencyQuote(rates: AnyRates, asset: CurrencyAsset): Rates['cedearArs'] {
  if (isGlobalRates(rates)) return asset === 'usd' ? rates.ibitUsd : null;
  return asset === 'ars' ? rates.cedearArs : asset === 'usd' ? rates.cedearUsd : rates.cedearUsdCcl;
}

export function hasDisallowedSeparator(text: string, asset: Asset, market: Market = 'ar'): boolean {
  return inputDecimalPlaces(asset, market) === 0 ? /[.,]/.test(text) : asset === 'btc' || market === 'global' ? text.includes(',') : text.includes('.');
}

export function inputFormatHint(asset: Asset, market: Market = 'ar'): string {
  const t = translator(market);
  return t(asset === 'cedear' ? 'wholeCedearHint'
    : asset === 'ibit' && market === 'global' ? 'wholeIbitHint'
    : asset === 'sats' ? 'satsHint' : asset === 'btc' ? 'btcHint' : market === 'ar' ? 'commaHint' : 'dotHint');
}

/** Source-specific input: whole CEDEAR and sats, dot for BTC, comma for other units. */
export function getAmountInputRules(asset: Asset, market: Market = 'ar'): NumericInputRules {
  const t = translator(market);
  return {
    market,
    separator: inputDecimalPlaces(asset, market) === 0 ? null : asset === 'btc' ? '.' : decimalSeparator(market),
    decimalPlaces: inputDecimalPlaces(asset, market),
    maximum: getMaxAmount(asset),
    separatorMessage: inputFormatHint(asset, market),
    precisionMessage: t(asset === 'btc' ? 'precisionBtc' : 'precisionMoney'),
    maximumMessage: t(asset === 'btc' ? 'maximumBtc' : asset === 'sats' ? 'maximumSats' : 'maximumAmount'),
  };
}

export function parseAmount(raw: string, asset: Asset, market: Market = 'ar'): Decimal | null {
  if (!assetsFor(market).includes(asset)) throw new Error(translator(market)('unsupportedAsset'));
  return parseNumericInput(raw, getAmountInputRules(asset, market));
}

function validateAmount(amount: Decimal, asset: Asset, market: Market = 'ar'): void {
  const t = translator(market);
  if (!assetsFor(market).includes(asset)) throw new Error(t('unsupportedAsset'));
  if (!amount.isFinite() || amount.isNegative()) {
    throw new Error(t('invalidAmount'));
  }
  if (amount.gt(getMaxAmount(asset))) {
    throw new Error(t(asset === 'btc' ? 'maximumBtc' : asset === 'sats' ? 'maximumSats' : 'maximumAmount'));
  }
  if (asset === 'sats' && !amount.isInteger()) {
    throw new Error(t('wholeSats'));
  }
  if (market === 'global' && asset === 'ibit' && !amount.isInteger()) throw new Error(t('wholeIbitHint'));
  if (asset === 'btc' && amount.decimalPlaces() > BTC_DECIMAL_PLACES) {
    throw new Error(t('precisionBtc'));
  }
}

/** Currency inputs select whole CEDEAR units; exactly half a unit rounds up. */
export function getMonetaryRounding(amount: Decimal, source: CurrencyAsset, rates: Rates): MonetaryRounding {
  validateAmount(amount, source);
  const quote = getCurrencyQuote(rates, source);
  if (!quote) throw new Error(translator('ar')('quoteMissing'));
  const theoreticalCedears = amount.div(quote.price);
  const cedears = theoreticalCedears.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const total = cedears.mul(quote.price);
  return {
    theoreticalCedears, cedears, total, difference: total.minus(amount),
    direction: cedears.eq(theoreticalCedears) ? 'exact' : cedears.gt(theoreticalCedears) ? 'up' : 'down',
  };
}

export interface WholeUnitRounding {
  unit: 'cedear' | 'ibit';
  theoreticalUnits: Decimal;
  units: Decimal;
  total: Decimal;
  difference: Decimal;
  direction: 'up' | 'down' | 'exact';
}

export function getWholeUnitRounding(amount: Decimal, source: CurrencyAsset, rates: AnyRates): WholeUnitRounding {
  if (!isGlobalRates(rates)) {
    const rounding = getMonetaryRounding(amount, source, rates);
    return { ...rounding, unit: 'cedear', units: rounding.cedears, theoreticalUnits: rounding.theoreticalCedears };
  }
  validateAmount(amount, source, 'global');
  const quote = getCurrencyQuote(rates, source);
  if (!quote) throw new Error(translator('global')('quoteMissing'));
  const theoreticalUnits = amount.div(quote.price);
  const units = theoreticalUnits.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const total = units.mul(quote.price);
  return { unit: 'ibit', theoreticalUnits, units, total, difference: total.minus(amount),
    direction: units.eq(theoreticalUnits) ? 'exact' : units.gt(theoreticalUnits) ? 'up' : 'down' };
}

export function convert(amount: Decimal, source: Asset, rates: AnyRates): Amounts {
  if (isGlobalRates(rates)) {
    validateAmount(amount, source, 'global');
    const btcPerShare = new Decimal(rates.holdingsBtc).div(rates.sharesOutstanding);
    const ibit = source === 'usd' ? getWholeUnitRounding(amount, source, rates).units
      : source === 'btc' ? amount.div(btcPerShare)
      : source === 'sats' ? amount.div(SATOSHIS_PER_BTC).div(btcPerShare) : amount;
    const btc = source === 'btc' ? amount : source === 'sats' ? amount.div(SATOSHIS_PER_BTC) : ibit.mul(btcPerShare);
    return { cedear: null, ars: null, usd_ccl: null, ibit, btc,
      sats: source === 'sats' ? amount : btc.mul(SATOSHIS_PER_BTC),
      usd: rates.ibitUsd ? ibit.mul(rates.ibitUsd.price) : null };
  }
  validateAmount(amount, source);
  const btcPerShare = new Decimal(rates.holdingsBtc).div(rates.sharesOutstanding);
  const cedearsPerShare = new Decimal(rates.cedearsPerShare);
  const monetary = isCurrencyAsset(source) ? getMonetaryRounding(amount, source, rates) : null;
  const ibit = source === 'cedear' ? amount.div(cedearsPerShare)
    : source === 'btc' ? amount.div(btcPerShare)
    : source === 'sats' ? amount.div(SATOSHIS_PER_BTC).div(btcPerShare)
    : monetary ? monetary.cedears.div(cedearsPerShare)
    : amount;
  const cedear = monetary ? monetary.cedears : source === 'cedear' ? amount : ibit.mul(cedearsPerShare);
  const btc = source === 'btc' ? amount : source === 'sats' ? amount.div(SATOSHIS_PER_BTC) : ibit.mul(btcPerShare);
  return {
    cedear,
    ibit,
    btc,
    sats: source === 'sats' ? amount : btc.mul(SATOSHIS_PER_BTC),
    usd: rates.cedearUsd ? cedear.mul(rates.cedearUsd.price) : null,
    usd_ccl: rates.cedearUsdCcl ? cedear.mul(rates.cedearUsdCcl.price) : null,
    ars: rates.cedearArs ? cedear.mul(rates.cedearArs.price) : null,
  };
}

export function inputAmount(amount: Decimal, asset: Asset, market: Market = 'ar'): string {
  const fixed = amount.toDecimalPlaces(inputDecimalPlaces(asset, market), Decimal.ROUND_HALF_UP).toFixed();
  return asset === 'btc' || market === 'global' ? fixed : fixed.replace('.', ',');
}

export function formatAmount(amount: Decimal, asset: Asset, market: Market = 'ar'): { text: string; approximate: boolean } {
  const places = asset === 'sats' ? 0 : asset === 'btc' ? BTC_DECIMAL_PLACES : AMOUNT_DECIMAL_PLACES;
  const rounded = amount.toDecimalPlaces(places);
  if (amount.gt(0) && rounded.isZero()) {
    return { text: asset === 'sats' ? '< 1' : asset === 'btc' ? '< 0.00000001' : market === 'ar' ? '< 0,01' : '< 0.01', approximate: true };
  }
  const fixed = asset === 'btc' ? rounded.toFixed(BTC_DECIMAL_PLACES) : isCurrencyAsset(asset) ? rounded.toFixed(2) : rounded.toFixed();
  if (asset === 'btc' || asset === 'sats') return { text: fixed, approximate: !rounded.eq(amount) };
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, market === 'ar' ? '.' : ',');
  return { text: fraction ? `${grouped}${decimalSeparator(market)}${fraction}` : grouped, approximate: !rounded.eq(amount) };
}

export function isStale(asOf: string, now = new Date()): boolean {
  const dataTime = Date.parse(`${asOf}T00:00:00Z`);
  return !Number.isFinite(dataTime) || now.getTime() - dataTime > 7 * 24 * 60 * 60 * 1000;
}
