import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { AverageCostModel, formatCost, getCostEquivalents, getCostUnit, parseAverageCost } from './average-cost';
import { SOURCES } from './rates';
import type { Rates } from './rates';

const rates: Rates = {
  asOf: '2026-10-05', fetchedAt: '2026-10-06T17:00:00Z', holdingsBtc: '56', sharesOutstanding: '100000',
  cedearsPerShare: '10', cedearRatio: '10:1', cedearArs: null, cedearUsd: null, cedearUsdCcl: null, sources: SOURCES,
};

describe('precio promedio equivalente', () => {
  it.each([['cedear', '4.368'], ['ibit', '43.68'], ['btc', '78000']] as const)('equivale a 78000 por BTC desde %s', (unit, price) => {
    const result = getCostEquivalents(new Decimal(price), unit, rates);
    expect(result.btc.eq(78000)).toBe(true);
    expect(result.cedear.eq('4.368')).toBe(true);
    expect(result.ibit.eq('43.68')).toBe(true);
  });
  it('fija la unidad de compra por mercado, independientemente del conversor', () => {
    expect(getCostUnit('ar')).toBe('cedear');
    expect(getCostUnit('global')).toBe('ibit');
  });
  it('usa la equivalencia del fondo sin depender de cotizaciones monetarias', () => {
    const price = new Decimal('6552');
    expect(getCostEquivalents(price, 'cedear', rates).btc.eq('117000000')).toBe(true);
    expect(getCostEquivalents(price, 'cedear', { ...rates, cedearArs: { price: '999999', fetchedAt: rates.fetchedAt } }).btc.eq('117000000')).toBe(true);
  });
  it('usa el ratio publicado y la fecha del informe, sin constantes de ejemplo', () => {
    const changed = { ...rates, holdingsBtc: '50', cedearsPerShare: '20', cedearRatio: '20:1' };
    const result = getCostEquivalents(new Decimal('2'), 'cedear', changed);
    expect(result.ibit.eq('40')).toBe(true);
    expect(result.btc.eq('80000')).toBe(true);
  });
  it('conserva el promedio exacto al recalcular y actualizar el informe', () => {
    const model = new AverageCostModel();
    const recurring = { ...rates, holdingsBtc: '53.12345678', sharesOutstanding: '100001' };
    model.setPrice('4,37');
    const initial = model.view(recurring).equivalents!.btc;
    for (let i = 0; i < 10; i++) {
      expect(model.view(recurring).input).toBe('4,37');
      expect(model.view(recurring).equivalents!.btc.eq(initial)).toBe(true);
    }
    expect(model.view(recurring).input).toBe('4,37');
    const nextRates = { ...recurring, holdingsBtc: '52' };
    expect(model.view(nextRates).input).toBe('4,37');
    expect(model.view(nextRates).equivalents!.cedear!.eq('4.37')).toBe(true);
    expect(model.view(nextRates).equivalents!.btc.eq(initial)).toBe(false);
  });
  it.each([['ars', '80'], ['usd', '4'], ['usd_ccl', '4']] as const)('convierte el promedio de %s desde CEDEAR y nunca lo interpreta por BTC', (currency, raw) => {
    const model = new AverageCostModel();
    model.currency = currency;
    model.setPrice(raw);
    const view = model.view(rates);
    expect(view.input).toBe(raw);
    expect(view.equivalents!.cedear!.eq(raw)).toBe(true);
    expect(view.equivalents!.btc.eq(new Decimal(raw).mul(10).div('0.00056'))).toBe(true);
  });
  it('conserva promedios independientes al cambiar entre pesos, MEP y CCL', () => {
    const model = new AverageCostModel();
    model.setPrice('4,48');
    model.currency = 'ars';
    expect(model.currency).toBe('ars');
    expect(model.view(rates).hasPrice).toBe(false);
    model.setPrice('6552');
    model.currency = 'usd_ccl';
    expect(model.view(rates).hasPrice).toBe(false);
    model.setPrice('4,2');
    model.currency = 'usd';
    expect(model.view(rates).equivalents!.btc.eq(80000)).toBe(true);
    model.currency = 'ars';
    expect(model.view(rates).equivalents!.btc.eq(117000000)).toBe(true);
    model.currency = 'usd_ccl';
    expect(model.currency).toBe('usd_ccl');
    expect(model.view(rates).equivalents!.btc.eq(75000)).toBe(true);
  });
  it('conserva borradores y sus errores sin datos, y Limpiar elimina todas las monedas', () => {
    const model = new AverageCostModel();
    model.setPrice('4,37');
    expect(model.view(null).input).toBe('4,37');
    expect(model.view(null).equivalents).toBeNull();
    expect(model.view(rates).input).toBe('4,37');
    model.setPrice('-1');
    expect(model.view(rates).error).toBeTruthy();
    expect(model.view(null).error).toBeTruthy();
    model.currency = 'ars';
    model.setPrice('6552');
    model.clear();
    expect(model.view(rates).hasPrice).toBe(false);
    model.currency = 'usd';
    expect(model.view(rates).hasPrice).toBe(false);
  });
  it.each(['ars', 'usd', 'usd_ccl'] as const)('conserva los dos decimales del precio en %s aunque el resultado requiera redondeo', currency => {
    const model = new AverageCostModel();
    model.currency = currency;
    model.setPrice('4,37');
    for (const nextRates of [rates, { ...rates, holdingsBtc: '53.12345678' }, rates]) {
      const view = model.view(nextRates);
      expect(view.input).toBe('4,37');
      expect(view.equivalents!.cedear!.eq('4.37')).toBe(true);
    }
    model.setPrice('4,371');
    expect(model.view(rates).error).toContain('hasta 2 decimales');
  });
});

describe('entrada y presentación del promedio', () => {
  it('admite coma y hasta dos decimales en todos los precios fiat', () => {
    expect(parseAverageCost(' 4,37 ')!.eq('4.37')).toBe(true);
    expect(parseAverageCost(',5')!.eq('0.5')).toBe(true);
    expect(parseAverageCost('78000,')!.eq(78000)).toBe(true);
    expect(parseAverageCost('')).toBeNull();
    expect(parseAverageCost('  ')).toBeNull();
  });
  it('una coma inicial es un borrador incompleto, sin error ni resultados', () => {
    const model = new AverageCostModel();
    model.setPrice(',');
    expect(model.view(rates)).toMatchObject({ input: ',', error: '', hasPrice: false, equivalents: null });
    expect(() => parseAverageCost(',')).toThrow('Completá el número');
    model.setPrice(',5');
    expect(model.view(rates).hasPrice).toBe(true);
  });
  it.each(['0', '-1', '-0', '+1', '4.368', '1.000,50', '1,000,50', '1e3', 'NaN', 'Infinity', '4,368', '1,000', '1,000000000', '1'.repeat(49), '1000000000000000000000000000001'])('rechaza costos inválidos: %s', raw => {
    expect(() => parseAverageCost(raw)).toThrow();
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e31'])('también protege el cálculo directo: %s', price => {
    expect(() => getCostEquivalents(new Decimal(price), 'btc', rates)).toThrow();
  });
  it('distingue aproximaciones y evita ocultar precios positivos pequeños', () => {
    expect(formatCost(new Decimal('78000'))).toEqual({ text: '78.000,00', approximate: false });
    expect(formatCost(new Decimal('4.368'))).toEqual({ text: '4,37', approximate: true });
    expect(formatCost(new Decimal('78000.005'))).toEqual({ text: '78.000,01', approximate: true });
    expect(formatCost(new Decimal('0.0000000001'))).toEqual({ text: '< 0,01', approximate: true });
  });
});
