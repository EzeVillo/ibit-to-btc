import Decimal from 'decimal.js';
import { AMOUNT_DECIMAL_PLACES, formatAmount } from './conversion';
import type { CurrencyAsset } from './conversion';
import { isGlobalRates } from './rates';
import type { AnyRates, Rates } from './rates';
import { decimalSeparator } from './market';
import type { Market } from './market';
import { translator } from './i18n';
import { parseNumericInput } from './numeric-input';
import type { NumericInputRules } from './numeric-input';

export type CostUnit = 'cedear' | 'ibit' | 'btc';
export type CostEquivalents = Record<CostUnit, Decimal>;
export type AnyCostEquivalents = { cedear: Decimal | null; ibit: Decimal; btc: Decimal };
export const COST_DECIMAL_PLACES = AMOUNT_DECIMAL_PLACES;
export const MAX_AVERAGE_COST = new Decimal('1e30');
export function costFormatHint(market: Market = 'ar'): string {
  return translator(market)(market === 'ar' ? 'costCommaHint' : 'costDotHint');
}
export const COST_FORMAT_HINT = costFormatHint();
export function getCostInputRules(market: Market = 'ar'): NumericInputRules {
  const t = translator(market);
  return { market, separator: decimalSeparator(market), decimalPlaces: COST_DECIMAL_PLACES, maximum: MAX_AVERAGE_COST,
    separatorMessage: t(market === 'ar' ? 'costCommaError' : 'costDotError'),
    precisionMessage: t('costPrecision'), maximumMessage: t('costMaximum'), zeroMessage: t('costZero') };
}
export const COST_INPUT_RULES = getCostInputRules();

export function getCostUnit(market: Market = 'ar'): 'cedear' | 'ibit' {
  return market === 'global' ? 'ibit' : 'cedear';
}

export function parseAverageCost(raw: string, market: Market = 'ar'): Decimal | null {
  return parseNumericInput(raw, getCostInputRules(market));
}

/** All prices remain in the supplied currency; market quotes never convert a cost. */
export function getCostEquivalents(price: Decimal, unit: CostUnit, rates: Rates): CostEquivalents;
export function getCostEquivalents(price: Decimal, unit: CostUnit, rates: AnyRates): AnyCostEquivalents;
export function getCostEquivalents(price: Decimal, unit: CostUnit, rates: AnyRates): AnyCostEquivalents {
  if (!price.isFinite() || !price.gt(0) || price.gt(MAX_AVERAGE_COST)) {
    throw new Error(translator(isGlobalRates(rates) ? 'global' : 'ar')('costInvalid'));
  }
  const btcPerIbit = new Decimal(rates.holdingsBtc).div(rates.sharesOutstanding);
  if (isGlobalRates(rates)) {
    if (unit === 'cedear') throw new Error(translator('global')('unsupportedAsset'));
    return { cedear: null, ibit: unit === 'btc' ? price.mul(btcPerIbit) : price,
      btc: unit === 'btc' ? price : price.div(btcPerIbit) };
  }
  const ratio = new Decimal(rates.cedearsPerShare);
  const ibit = unit === 'cedear' ? price.mul(ratio) : unit === 'btc' ? price.mul(btcPerIbit) : price;
  return { cedear: unit === 'cedear' ? price : ibit.div(ratio), ibit, btc: unit === 'btc' ? price : ibit.div(btcPerIbit) };
}

export function formatCost(price: Decimal, market: Market = 'ar'): { text: string; approximate: boolean } {
  return formatAmount(price, 'usd', market);
}

export interface CostView {
  input: string;
  error: string;
  equivalents: AnyCostEquivalents | null;
  hasPrice: boolean;
}

/** The purchase unit is fixed per market; only the cost's own currency selects a draft. */
export class AverageCostModel {
  currency: CurrencyAsset = 'usd';
  private drafts: Record<CurrencyAsset, string> = {
    ars: '', usd: '', usd_ccl: '',
  };

  constructor(private readonly market: Market = 'ar') {}

  setPrice(raw: string): void {
    this.drafts[this.currency] = raw;
  }

  clear(): void {
    for (const currency of ['ars', 'usd', 'usd_ccl'] as const) this.drafts[currency] = '';
  }

  view(rates: AnyRates | null): CostView {
    const raw = this.drafts[this.currency];
    const empty: CostView = { input: raw, error: '', equivalents: null, hasPrice: false };
    if (raw === decimalSeparator(this.market)) return empty;
    let price: Decimal | null;
    try { price = parseAverageCost(raw, this.market); }
    catch (error) { return { ...empty, error: (error as Error).message }; }
    if (!price) return empty;
    const equivalents = rates ? getCostEquivalents(price, getCostUnit(this.market), rates) : null;
    return { ...empty, equivalents, hasPrice: true };
  }
}
