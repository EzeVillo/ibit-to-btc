import Decimal from 'decimal.js';
import { AMOUNT_DECIMAL_PLACES, assetsFor, formatAmount, isCurrencyAsset } from './conversion';
import type { Asset, CurrencyAsset } from './conversion';
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

export function getCostUnit(source: Asset, market: Market = 'ar'): CostUnit {
  if (market === 'global') return 'ibit';
  return source === 'ibit' ? 'ibit' : source === 'btc' || source === 'sats' ? 'btc' : 'cedear';
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

export function costInput(price: Decimal, market: Market = 'ar'): string {
  return price.toDecimalPlaces(COST_DECIMAL_PLACES).toFixed().replace('.', decimalSeparator(market));
}

export function formatCost(price: Decimal, market: Market = 'ar'): { text: string; approximate: boolean } {
  return formatAmount(price, 'usd', market);
}

interface CostDraft { raw: string; unit: CostUnit }
export interface CostView {
  input: string;
  inputApproximate: boolean;
  error: string;
  equivalents: AnyCostEquivalents | null;
  hasPrice: boolean;
}

/** Keep the original unit and decimal input so switching views or refreshing rates cannot erode precision. */
export class AverageCostModel {
  currency: CurrencyAsset = 'usd';
  source: Asset = 'cedear';
  private drafts: Record<CurrencyAsset, CostDraft> = {
    ars: { raw: '', unit: 'cedear' }, usd: { raw: '', unit: 'cedear' }, usd_ccl: { raw: '', unit: 'cedear' },
  };

  constructor(private readonly market: Market = 'ar') {
    if (market === 'global') { this.source = 'ibit'; this.drafts.usd.unit = 'ibit'; }
  }

  setSource(source: Asset): void {
    if (!assetsFor(this.market).includes(source)) throw new Error(translator(this.market)('unsupportedAsset'));
    if (source !== this.source && isCurrencyAsset(source)) this.currency = source;
    this.source = source;
  }

  setPrice(raw: string): void {
    this.drafts[this.currency] = { raw, unit: getCostUnit(this.source, this.market) };
  }

  clear(): void {
    for (const currency of ['ars', 'usd', 'usd_ccl'] as const) this.drafts[currency] = { raw: '', unit: this.market === 'ar' ? 'cedear' : 'ibit' };
  }

  view(rates: AnyRates | null): CostView {
    const draft = this.drafts[this.currency];
    const empty: CostView = { input: draft.raw, inputApproximate: false, error: '', equivalents: null, hasPrice: false };
    if (draft.raw === decimalSeparator(this.market)) return empty;
    let price: Decimal | null;
    try { price = parseAverageCost(draft.raw, this.market); }
    catch (error) { return { ...empty, error: (error as Error).message }; }
    if (!price) return empty;
    const unit = getCostUnit(this.source, this.market);
    if (!rates) return { ...empty, input: unit === draft.unit ? draft.raw : '', hasPrice: true };
    const equivalents = getCostEquivalents(price, draft.unit, rates);
    const input = unit === draft.unit ? draft.raw : costInput(equivalents[unit]!, this.market);
    const displayed = new Decimal(input.replace(',', '.'));
    return { input, inputApproximate: !displayed.eq(equivalents[unit]!), error: '', equivalents, hasPrice: true };
  }
}
