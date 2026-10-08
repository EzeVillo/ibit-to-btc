import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { AverageCostModel, formatCost, getCostEquivalents, getCostUnit, parseAverageCost } from './average-cost';
import { assets } from './conversion';
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
  it('admite todos los orígenes y pide precio por BTC para satoshis', () => {
    expect(assets.map(asset => getCostUnit(asset))).toEqual(['cedear', 'ibit', 'btc', 'btc', 'cedear', 'cedear', 'cedear']);
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
  it('conserva precisión en conversiones repetidas y actualiza desde la unidad original', () => {
    const model = new AverageCostModel();
    const recurring = { ...rates, holdingsBtc: '53.12345678', sharesOutstanding: '100001' };
    model.setPrice('4,37');
    const initial = model.view(recurring).equivalents!.btc;
    for (let i = 0; i < 10; i++) {
      model.setSource('btc');
      expect(model.view(recurring).inputApproximate).toBe(true);
      expect(model.view(recurring).equivalents!.btc.eq(initial)).toBe(true);
      model.setSource('ibit');
      model.setSource('cedear');
    }
    expect(model.view(recurring).input).toBe('4,37');
    const nextRates = { ...recurring, holdingsBtc: '52' };
    model.setSource('btc');
    expect(model.view(nextRates).equivalents!.cedear!.eq('4.37')).toBe(true);
    expect(model.view(nextRates).equivalents!.btc.eq(initial)).toBe(false);
  });
  it('mantiene un costo ingresado por BTC cuando se actualiza el informe', () => {
    const model = new AverageCostModel();
    model.setSource('btc');
    model.setPrice('78000');
    model.setSource('ibit');
    const next = model.view({ ...rates, holdingsBtc: '50' });
    expect(next.equivalents!.btc.eq(78000)).toBe(true);
    expect(next.input).toBe('39');
    model.setPrice('40');
    model.setSource('btc');
    expect(model.view({ ...rates, holdingsBtc: '50' }).input).toBe('80000');
  });
  it('conserva promedios independientes al cambiar entre pesos, MEP y CCL', () => {
    const model = new AverageCostModel();
    model.setPrice('4,48');
    model.setSource('ars');
    expect(model.currency).toBe('ars');
    expect(model.view(rates).hasPrice).toBe(false);
    model.setPrice('6552');
    model.setSource('usd_ccl');
    expect(model.view(rates).hasPrice).toBe(false);
    model.setPrice('4,2');
    model.setSource('usd');
    expect(model.view(rates).equivalents!.btc.eq(80000)).toBe(true);
    model.setSource('ars');
    expect(model.view(rates).equivalents!.btc.eq(117000000)).toBe(true);
    model.currency = 'usd_ccl';
    model.setSource('ars');
    expect(model.currency).toBe('usd_ccl');
    expect(model.view(rates).equivalents!.btc.eq(75000)).toBe(true);
  });
  it('conserva borradores y sus errores sin datos, y Limpiar elimina todas las monedas', () => {
    const model = new AverageCostModel();
    model.setPrice('4,37');
    expect(model.view(null).input).toBe('4,37');
    model.setSource('ibit');
    expect(model.view(null).equivalents).toBeNull();
    expect(model.view(rates).input).toBe('43,7');
    model.setPrice('-1');
    expect(model.view(rates).error).toBeTruthy();
    model.setSource('cedear');
    expect(model.view(rates).error).toBeTruthy();
    model.setSource('ars');
    model.setPrice('6552');
    model.clear();
    expect(model.view(rates).hasPrice).toBe(false);
    model.setSource('usd');
    expect(model.view(rates).hasPrice).toBe(false);
  });
  it.each(['ars', 'usd', 'usd_ccl'] as const)('limita los precios en %s a dos decimales al cambiar de unidad', currency => {
    const model = new AverageCostModel();
    model.currency = currency;
    model.setSource('btc');
    model.setPrice('78000,01');
    for (const source of ['cedear', 'ibit', 'btc'] as const) {
      model.setSource(source);
      const view = model.view(rates);
      expect((view.input.split(',')[1] ?? '').length).toBeLessThanOrEqual(2);
      expect(view.equivalents!.btc.eq('78000.01')).toBe(true);
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
