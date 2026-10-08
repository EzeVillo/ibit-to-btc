import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { assetsFor, convert, currenciesFor, formatAmount, getAmountInputRules, getWholeUnitRounding, inputAmount, parseAmount } from './conversion';
import { GLOBAL_SOURCES, validateGlobalRates } from './rates';
import type { GlobalRates } from './rates';
import { AverageCostModel, getCostUnit, parseAverageCost } from './average-cost';
import { marketFromPath } from './market';
import { translator } from './i18n';
import { averageCostMarkup } from './average-cost-ui';
import { methodologyMarkup } from './view';

const rates: GlobalRates = {
  market: 'global', asOf: '2026-10-05', fetchedAt: '2026-10-06T17:00:00Z', holdingsBtc: '56', sharesOutstanding: '100000',
  ibitUsd: { price: '50', quotedAt: '2026-10-06T16:59:00Z', fetchedAt: '2026-10-06T17:00:00Z' },
  quoteStatus: 'available', sources: GLOBAL_SOURCES,
};

describe('international market', () => {
  it('uses explicit URLs and exposes only IBIT, BTC, sats and USD', () => {
    expect(marketFromPath('/')).toBe('global'); expect(marketFromPath('/ar/')).toBe('ar'); expect(marketFromPath('/ar')).toBe('ar');
    expect(marketFromPath('/arbitrary')).toBe('global');
    expect(assetsFor('global')).toEqual(['ibit', 'btc', 'sats', 'usd']); expect(currenciesFor('global')).toEqual(['usd']);
  });
  it.each([
    ['0', '0', '0', 'exact'], ['24.99', '0', '-24.99', 'down'], ['25', '1', '25', 'up'],
    ['74.99', '1', '-24.99', 'down'], ['75', '2', '25', 'up'], ['100', '2', '0', 'exact'],
  ])('rounds USD %s to %s whole IBIT shares, with cash difference %s', (amount, shares, difference, direction) => {
    const result = convert(new Decimal(amount), 'usd', rates);
    expect(result.ibit!.eq(shares)).toBe(true); expect(result.btc!.eq(new Decimal(shares).mul('0.00056'))).toBe(true);
    expect(result.usd!.eq(new Decimal(shares).mul(50))).toBe(true);
    const rounded = getWholeUnitRounding(new Decimal(amount), 'usd', rates);
    expect(rounded.unit).toBe('ibit'); expect(rounded.difference.eq(difference)).toBe(true); expect(rounded.direction).toBe(direction);
    expect(result.cedear).toBeNull(); expect(result.ars).toBeNull(); expect(result.usd_ccl).toBeNull();
  });
  it('preserves the exact threshold with high-precision prices', () => {
    const precise = { ...rates, ibitUsd: { ...rates.ibitUsd!, price: '43.68123456789' } };
    const halfway = new Decimal(precise.ibitUsd.price).mul('1.5');
    expect(convert(halfway, 'usd', precise).ibit!.eq(2)).toBe(true);
    expect(convert(halfway.minus('0.0000000000001'), 'usd', precise).ibit!.eq(1)).toBe(true);
  });
  it.each([['ibit', '10'], ['btc', '0.0056'], ['sats', '560000'], ['usd', '500']] as const)('uses the share quote from %s', (asset, amount) => {
    const result = convert(new Decimal(amount), asset, rates);
    expect(result.ibit!.eq(10)).toBe(true); expect(result.btc!.eq('0.0056')).toBe(true); expect(result.sats!.eq(560000)).toBe(true); expect(result.usd!.eq(500)).toBe(true);
  });
  it('shows theoretical fractional exposure from BTC, but IBIT inputs use whole shares', () => {
    const result = convert(new Decimal('0.00084'), 'btc', rates);
    expect(result.ibit!.eq('1.5')).toBe(true); expect(result.btc!.eq('0.00084')).toBe(true);
    expect(inputAmount(result.ibit!, 'ibit', 'global')).toBe('2');
    expect(() => convert(new Decimal('1.5'), 'ibit', rates)).toThrow('whole IBIT');
  });
  it('keeps fund conversions available without inventing a USD quote', () => {
    const partial: GlobalRates = { ...rates, ibitUsd: null, quoteStatus: 'unavailable' };
    expect(convert(new Decimal(10), 'ibit', partial).btc!.eq('0.0056')).toBe(true);
    expect(convert(new Decimal(10), 'ibit', partial).usd).toBeNull();
    expect(() => convert(new Decimal(100), 'usd', partial)).toThrow('unavailable');
  });
  it.each(['cedear', 'ars', 'usd_ccl'] as const)('rejects the Argentine asset %s, including programmatic calls', asset => {
    expect(() => convert(new Decimal(1), asset, rates)).toThrow('unavailable in this version');
    expect(() => parseAmount('1', asset, 'global')).toThrow('unavailable in this version');
  });
});

describe('localized numbers with the same strict validations', () => {
  it('uses a decimal point for global USD and average price; Argentine commas remain valid', () => {
    expect(parseAmount('1000.50', 'usd', 'global')!.eq('1000.5')).toBe(true);
    expect(parseAmount('1000,50', 'usd', 'ar')!.eq('1000.5')).toBe(true);
    expect(parseAverageCost('43.68', 'global')!.eq('43.68')).toBe(true);
    expect(() => parseAmount('1000,50', 'usd', 'global')).toThrow('decimal point');
    expect(() => parseAverageCost('43,68', 'global')).toThrow('decimal point');
    expect(() => parseAmount('1000.50', 'usd', 'ar')).toThrow('coma decimal');
  });
  it.each(['ar', 'global'] as const)('always uses a decimal point, eight decimals and the existing maximum for BTC in %s', market => {
    expect(parseAmount('0.00000001', 'btc', market)!.eq('0.00000001')).toBe(true);
    expect(parseAmount('21000000', 'btc', market)!.eq(21000000)).toBe(true);
    for (const value of ['0,01', '0.000000001', '21000000.00000001', '-1', '1e3', '1 000']) expect(() => parseAmount(value, 'btc', market)).toThrow();
    expect(formatAmount(new Decimal('0.0056'), 'btc', market).text).toBe('0.00560000');
  });
  it('requires integer IBIT globally, retaining fractional IBIT inputs in Argentina', () => {
    expect(getAmountInputRules('ibit', 'global').separator).toBeNull();
    expect(parseAmount('10', 'ibit', 'global')!.eq(10)).toBe(true);
    for (const value of ['1.5', '1,5', '1.0', '1,000', '1.000']) expect(() => parseAmount(value, 'ibit', 'global')).toThrow('whole IBIT');
    expect(parseAmount('1,5', 'ibit', 'ar')!.eq('1.5')).toBe(true);
  });
  it.each(['-1', '+1', '1e3', '1E+3', '1 000', '1,000.50', '1.000,50', '1.2.3', '1.234', 'USD 1', 'NaN', 'Infinity', '1000000000001'])('rejects global USD %s without guessing or rounding the input', value => {
    expect(() => parseAmount(value, 'usd', 'global')).toThrow();
  });
  it('formats thousands for each market, retaining ungrouped BTC and sats', () => {
    expect(formatAmount(new Decimal('1234.5'), 'usd', 'global').text).toBe('1,234.50');
    expect(formatAmount(new Decimal('1234.5'), 'usd', 'ar').text).toBe('1.234,50');
    expect(formatAmount(new Decimal('0.001'), 'usd', 'global').text).toBe('< 0.01');
    expect(formatAmount(new Decimal('100000000'), 'sats', 'global').text).toBe('100000000');
    expect(inputAmount(new Decimal('1234.5'), 'usd', 'global')).toBe('1234.5');
  });
});

describe('global average purchase cost and copy', () => {
  it('uses USD per IBIT share and the fund report, independently of the market quote', () => {
    const model = new AverageCostModel('global'); model.setSource('usd'); model.setPrice('43.68');
    expect(getCostUnit('usd', 'global')).toBe('ibit');
    expect(model.view(rates).equivalents!.btc.eq(78000)).toBe(true);
    expect(model.view({ ...rates, ibitUsd: null, quoteStatus: 'unavailable' }).equivalents!.btc.eq(78000)).toBe(true);
    expect(model.view(rates).equivalents!.cedear).toBeNull();
    model.setSource('btc'); expect(model.view(rates).input).toBe('78000');
    model.setSource('ibit'); expect(model.view(rates).input).toBe('43.68');
    model.clear(); expect(model.view(rates).hasPrice).toBe(false);
  });
  it('retains the original purchase price when the exposure report changes', () => {
    const model = new AverageCostModel('global'); model.setPrice('43.68');
    expect(model.view({ ...rates, holdingsBtc: '28' }).equivalents!.btc.eq(156000)).toBe(true);
    expect(model.view(rates).input).toBe('43.68');
  });
  it('rejects zero, excess average-price precision and unsupported sources', () => {
    expect(() => parseAverageCost('0', 'global')).toThrow('greater than zero');
    expect(() => parseAverageCost('43.681', 'global')).toThrow('2 decimal');
    expect(() => new AverageCostModel('global').setSource('cedear')).toThrow();
  });
  it('renders the shared English text and only the relevant global methodology', () => {
    expect(translator('global')('clear')).toBe('Clear'); expect(translator('ar')('clear')).toBe('Limpiar');
    const markup = methodologyMarkup('global') + averageCostMarkup('global');
    expect(markup).not.toMatch(/CEDEAR|MEP|CCL|Comafi|ARS|Ingresá|Calculá|cotización/);
    expect(markup).toContain('Finnhub'); expect(markup).toContain('Average price per IBIT share');
  });
});

describe('global response validation', () => {
  it('accepts a verified response and explicit missing-quote states', () => {
    expect(validateGlobalRates(rates)).toBe(rates);
    expect(validateGlobalRates({ ...rates, ibitUsd: null, quoteStatus: 'not_configured' }).ibitUsd).toBeNull();
  });
  it.each([
    { market: 'ar' }, { asOf: '2026-02-31' }, { sharesOutstanding: '0' }, { holdingsBtc: 'NaN' },
    { sources: { ...GLOBAL_SOURCES, quotes: 'https://untrusted.test/' } }, { ibitUsd: null }, { quoteStatus: 'unknown' },
    { ibitUsd: { ...rates.ibitUsd!, price: '0' } }, { ibitUsd: { ...rates.ibitUsd!, quotedAt: '2026-10-07T17:00:00Z' } },
  ])('rejects invalid data %j', override => { expect(() => validateGlobalRates({ ...rates, ...override })).toThrow(); });
});
