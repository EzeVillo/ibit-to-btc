import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { assets, convert, currencyAssets, formatAmount, getCurrencyQuote, getMaxAmount, getMonetaryRounding, hasDisallowedSeparator, inputAmount, isStale, parseAmount } from './conversion';
import { SOURCES, validateRates } from './rates';
import type { Asset } from './conversion';
import type { Rates } from './rates';

const rates: Rates = {
  asOf: '2026-10-05', fetchedAt: '2026-10-06T17:00:00Z',
  holdingsBtc: '56', sharesOutstanding: '100000', cedearsPerShare: '10', cedearRatio: '10:1',
  cedearUsd: { price: '5', fetchedAt: '2026-10-06T17:00:00Z' },
  cedearUsdCcl: { price: '4', fetchedAt: '2026-10-06T17:00:00Z' },
  cedearArs: { price: '7500', fetchedAt: '2026-10-06T17:00:00Z' }, sources: SOURCES,
};
const equivalents: Record<Asset, string> = { cedear: '100', ibit: '10', btc: '0.0056', sats: '560000', usd: '500', usd_ccl: '400', ars: '750000' };

describe('conversiones desde los siete orígenes', () => {
  it.each(assets)('convierte %s a las otras seis unidades', source => {
    const result = convert(new Decimal(equivalents[source]), source, rates);
    for (const target of assets) expect(result[target]!.eq(equivalents[target])).toBe(true);
  });
  it('conserva la exposición fraccionaria entre CEDEAR e IBIT sin redondear los activos', () => {
    const initial = new Decimal('12.34567890123456789');
    const quantityAssets: Asset[] = ['cedear', 'ibit'];
    for (const source of quantityAssets) {
      for (const target of quantityAssets) {
        const converted = convert(initial, source, rates)[target]!;
        const recovered = convert(converted, target, rates)[source]!;
        expect(recovered.minus(initial).abs().lt('0.000000000000000000000000000001')).toBe(true);
      }
    }
  });
  it('conserva la exposición de BTC válidos al convertir a CEDEAR o IBIT y volver', () => {
    const initial = new Decimal('12.34567890');
    const amounts = convert(initial, 'btc', rates);
    for (const target of ['cedear', 'ibit'] as const) {
      const recovered = convert(amounts[target]!, target, rates).btc!;
      expect(recovered.minus(initial).abs().lt('1e-30')).toBe(true);
    }
  });
  it('conserva la cantidad de CEDEAR enteros al cambiar entre cualquiera de los siete orígenes', () => {
    const initial = convert(new Decimal('17'), 'cedear', rates);
    for (const source of assets) {
      const result = convert(initial[source]!, source, rates);
      for (const target of assets) expect(result[target]!.minus(initial[target]!).abs().lt('1e-30')).toBe(true);
    }
  });
  it('calcula USD desde ARS pasando por CEDEAR, sin tipo de cambio', () => {
    const result = convert(new Decimal(15000), 'ars', rates);
    expect(result.cedear!.toFixed()).toBe('2');
    expect(result.usd!.toFixed()).toBe('10');
    expect(convert(new Decimal(10), 'usd', rates).ars!.toFixed()).toBe('15000');
  });
  it('convierte entre MEP y CCL usando IBITD e IBITC como cotizaciones distintas', () => {
    const ccl = convert(new Decimal('52'), 'usd_ccl', rates);
    expect(ccl.cedear!.toFixed()).toBe('13');
    expect(ccl.usd!.toFixed()).toBe('65');
    expect(ccl.ars!.toFixed()).toBe('97500');
    expect(convert(new Decimal('65'), 'usd', rates).usd_ccl!.toFixed()).toBe('52');
  });
  it('mantiene las conversiones de activos cuando falla una cotización monetaria', () => {
    const partial = { ...rates, cedearUsd: null };
    const result = convert(new Decimal(100), 'cedear', partial);
    expect(result.btc!.toFixed()).toBe('0.0056');
    expect(result.ars!.toFixed()).toBe('750000');
    expect(result.usd).toBeNull();
    expect(() => convert(new Decimal(100), 'usd', partial)).toThrow('no está disponible');
  });
  it('mantiene MEP y ARS si no hay cotización CCL, sin sustituirla por IBITD', () => {
    const partial = { ...rates, cedearUsdCcl: null };
    const result = convert(new Decimal('13'), 'cedear', partial);
    expect(result.usd!.toFixed()).toBe('65');
    expect(result.ars!.toFixed()).toBe('97500');
    expect(result.usd_ccl).toBeNull();
    expect(() => convert(new Decimal(52), 'usd_ccl', partial)).toThrow('no está disponible');
    expect(validateRates(partial)).toBe(partial);
  });
  it('convierte cero y rechaza cantidades negativas o fuera de rango', () => {
    for (const amount of Object.values(convert(new Decimal(0), 'btc', rates))) expect(amount!.isZero()).toBe(true);
    for (const bad of ['-1', 'Infinity', 'NaN', '1000000000001']) expect(() => convert(new Decimal(bad), 'ibit', rates)).toThrow();
  });
  it.each(['21000000.00000001', '21000001', '0.000000001', '1.123456789', '-1', 'Infinity', 'NaN'])('el cálculo rechaza BTC inválidos: %s', value => {
    expect(() => convert(new Decimal(value), 'btc', rates)).toThrow();
  });
  it('el cálculo admite el máximo de BTC y un satoshi', () => {
    for (const value of ['21000000', '0.00000001']) {
      expect(convert(new Decimal(value), 'btc', rates).btc!.eq(value)).toBe(true);
    }
  });
});

describe('satoshis', () => {
  it.each([
    ['0', '0'], ['1', '0.00000001'], ['99000000', '0.99'],
    ['100000000', '1'], ['2100000000000000', '21000000'],
  ])('convierte %s sats a %s BTC y conserva exactamente la cantidad al volver', (sats, btc) => {
    const parsed = parseAmount(sats, 'sats')!;
    const result = convert(parsed, 'sats', rates);
    expect(result.sats!.toFixed()).toBe(sats);
    expect(result.btc!.toFixed()).toBe(btc);
    expect(convert(result.btc!, 'btc', rates).sats!.toFixed()).toBe(sats);
  });
  it('aplica el mismo límite de exposición para BTC y satoshis', () => {
    expect(getMaxAmount('sats').eq(getMaxAmount('btc').mul('100000000'))).toBe(true);
    expect(() => parseAmount('2100000000000001', 'sats')).toThrow('2100000000000000 sats');
    expect(() => convert(new Decimal('2100000000000001'), 'sats', rates)).toThrow('2100000000000000 sats');
  });
  it.each(['1.0', '1,0', '1.5', '1,5', '1.000', '1,000', '1 000', '1e8', '-1', '+1', 'NaN', 'Infinity', 'abc'])('rechaza separadores, fracciones y formatos inválidos: %s', value => {
    expect(() => parseAmount(value, 'sats')).toThrow();
  });
  it.each(['0.5', '-1', 'NaN', 'Infinity'])('también valida los cálculos directos: %s', value => {
    expect(() => convert(new Decimal(value), 'sats', rates)).toThrow();
  });
  it('bloquea comas y puntos, acepta vacío y conserva los dígitos ingresados', () => {
    expect(hasDisallowedSeparator('1,5', 'sats')).toBe(true);
    expect(hasDisallowedSeparator('1.5', 'sats')).toBe(true);
    expect(hasDisallowedSeparator('100000000', 'sats')).toBe(false);
    expect(parseAmount('', 'sats')).toBeNull();
    expect(parseAmount(' 00001 ', 'sats')!.eq(1)).toBe(true);
    expect(inputAmount(getMaxAmount('sats'), 'sats')).toBe('2100000000000000');
  });
  it('presenta enteros sin agrupación y distingue equivalencias menores a un satoshi', () => {
    expect(formatAmount(new Decimal('100000000'), 'sats')).toEqual({ text: '100000000', approximate: false });
    expect(formatAmount(getMaxAmount('sats'), 'sats')).toEqual({ text: '2100000000000000', approximate: false });
    expect(formatAmount(new Decimal('0.4'), 'sats')).toEqual({ text: '< 1', approximate: true });
    expect(formatAmount(new Decimal('12.5'), 'sats')).toEqual({ text: '13', approximate: true });
    expect(formatAmount(new Decimal('0'), 'sats')).toEqual({ text: '0', approximate: false });
  });
  it('conserva satoshis fraccionarios en la equivalencia y redondea al usarlos como entrada', () => {
    const preciseRates = { ...rates, holdingsBtc: '56.005' };
    const theoretical = convert(new Decimal('1'), 'cedear', preciseRates);
    expect(theoretical.sats!.toFixed()).toBe('5600.5');
    const text = inputAmount(theoretical.sats!, 'sats');
    expect(text).toBe('5601');
    const recalculated = convert(parseAmount(text, 'sats')!, 'sats', preciseRates);
    expect(recalculated.sats!.toFixed()).toBe('5601');
    expect(recalculated.btc!.toFixed()).toBe('0.00005601');
  });
  it('convierte BTC y satoshis aunque las tres cotizaciones monetarias falten', () => {
    const result = convert(new Decimal('1'), 'sats', { ...rates, cedearArs: null, cedearUsd: null, cedearUsdCcl: null });
    expect(result.btc!.toFixed()).toBe('0.00000001');
    expect(result.cedear!.gt(0)).toBe(true);
    expect(result.ibit!.gt(0)).toBe(true);
    for (const asset of currencyAssets) expect(result[asset]).toBeNull();
  });
});

describe('redondeo de CEDEAR cuando el origen es una moneda', () => {
  it.each(currencyAssets)('%s: redondea debajo, exactamente en y encima de media unidad', source => {
    const price = new Decimal(getCurrencyQuote(rates, source)!.price);
    for (const [fractional, units] of [['12.4', '12'], ['12.5', '13'], ['12.6', '13'], ['13.5', '14'], ['12.499999999999999', '12'], ['12.500000000000001', '13']]) {
      const entered = new Decimal(fractional).mul(price);
      const result = convert(entered, source, rates);
      expect(result.cedear!.toFixed()).toBe(units);
      expect(result.ibit!.eq(new Decimal(units).div(10))).toBe(true);
      expect(result.btc!.eq(new Decimal(units).div(10).mul('0.00056'))).toBe(true);
      expect(result.usd!.eq(new Decimal(units).mul(5))).toBe(true);
      expect(result.usd_ccl!.eq(new Decimal(units).mul(4))).toBe(true);
      expect(result.ars!.eq(new Decimal(units).mul(7500))).toBe(true);
    }
  });
  it('expone el valor real y el monto faltante cuando redondea hacia arriba', () => {
    const rounding = getMonetaryRounding(new Decimal('93750'), 'ars', rates);
    expect(rounding.theoreticalCedears.toFixed()).toBe('12.5');
    expect(rounding.cedears.toFixed()).toBe('13');
    expect(rounding.total.toFixed()).toBe('97500');
    expect(rounding.difference.toFixed()).toBe('3750');
    expect(rounding.direction).toBe('up');
    const usd = getMonetaryRounding(new Decimal('62.5'), 'usd', rates);
    expect(usd.total.toFixed()).toBe('65');
    expect(usd.difference.toFixed()).toBe('2.5');
  });
  it('expone el sobrante y conserva un caso exacto sin ajuste', () => {
    const rounding = getMonetaryRounding(new Decimal('93000'), 'ars', rates);
    expect(rounding.cedears.toFixed()).toBe('12');
    expect(rounding.total.toFixed()).toBe('90000');
    expect(rounding.difference.toFixed()).toBe('-3000');
    expect(rounding.direction).toBe('down');
    expect(getMonetaryRounding(new Decimal('90000'), 'ars', rates).direction).toBe('exact');
  });
  it('maneja montos menores a medio CEDEAR y el límite de media unidad', () => {
    expect(convert(new Decimal('2'), 'usd', rates).cedear!.isZero()).toBe(true);
    expect(convert(new Decimal('2'), 'usd', rates).btc!.isZero()).toBe(true);
    expect(getMonetaryRounding(new Decimal('2'), 'usd', rates).difference.toFixed()).toBe('-2');
    expect(convert(new Decimal('2.5'), 'usd', rates).cedear!.toFixed()).toBe('1');
    expect(getMonetaryRounding(new Decimal('0'), 'usd', rates).direction).toBe('exact');
  });
  it('no aplica el redondeo operativo a cantidades ingresadas directamente como activos', () => {
    const fractional = convert(new Decimal('12.5'), 'cedear', rates);
    expect(fractional.cedear!.toFixed()).toBe('12.5');
    expect(fractional.usd!.toFixed()).toBe('62.5');
    expect(() => getMonetaryRounding(new Decimal(10), 'ars', { ...rates, cedearArs: null })).toThrow('no está disponible');
  });
});

describe('entrada y presentación', () => {
  it.each(['ibit', 'ars', 'usd', 'usd_ccl'] as const)('%s admite coma decimal y rechaza el punto', asset => {
    expect(parseAmount(' 12,34 ', asset)!.toFixed()).toBe('12.34');
    expect(parseAmount(',5', asset)!.toFixed()).toBe('0.5');
    expect(parseAmount('', asset)).toBeNull();
    expect(() => parseAmount('12.34', asset)).toThrow();
    expect(hasDisallowedSeparator('12.34', asset)).toBe(true);
    expect(hasDisallowedSeparator('12,34', asset)).toBe(false);
  });
  it('BTC usa únicamente punto decimal, también en su presentación', () => {
    expect(parseAmount('0.00000001', 'btc')!.toFixed()).toBe('0.00000001');
    expect(parseAmount('.5', 'btc')!.toFixed()).toBe('0.5');
    expect(() => parseAmount('0,01', 'btc')).toThrow();
    expect(hasDisallowedSeparator('0,01', 'btc')).toBe(true);
    expect(hasDisallowedSeparator('0.01', 'btc')).toBe(false);
    expect(formatAmount(new Decimal(1000), 'btc').text).toBe('1000.00000000');
  });
  it.each(['0', '0.00000000', '0.00000001', '.12345678', '20999999.99999999', '21000000', '21000000.00000000'])('BTC admite cantidades dentro del rango y con hasta ocho decimales: %s', value => {
    expect(parseAmount(value, 'btc')!.eq(value)).toBe(true);
  });
  it.each(['0.000000001', '1.123456789', '1.000000000', '0.000000000'])('BTC rechaza más de ocho decimales, incluso ceros finales: %s', value => {
    expect(() => parseAmount(value, 'btc')).toThrow('hasta 8 decimales');
  });
  it.each(['21000000.00000001', '21000001', '1000000000000'])('BTC rechaza superar 21 millones: %s', value => {
    expect(() => parseAmount(value, 'btc')).toThrow('21.000.000 BTC');
  });
  it.each(['-1', '-0', '+1', 'NaN', 'Infinity', '1e8', 'abc', '.', '1.2.3', '0,01', '21 000 000', '1'.repeat(49)])('BTC rechaza entradas malformadas: %s', value => {
    expect(() => parseAmount(value, 'btc')).toThrow();
  });
  it('BTC vacío no calcula y los espacios exteriores no alteran el valor', () => {
    expect(parseAmount('', 'btc')).toBeNull();
    expect(parseAmount('   ', 'btc')).toBeNull();
    expect(parseAmount(' 0.00000001 ', 'btc')!.toFixed()).toBe('0.00000001');
  });
  it('los límites de BTC no se aplican a los otros activos', () => {
    for (const asset of ['cedear', 'ibit', 'ars', 'usd', 'usd_ccl'] as const) {
      expect(parseAmount('1000000000000', asset)!.toFixed()).toBe('1000000000000');
      expect(() => parseAmount('1000000000001', asset)).toThrow();
    }
  });
  it.each(['ibit', 'ars', 'usd', 'usd_ccl'] as const)('%s limita la entrada a dos decimales, incluso ceros finales', asset => {
    for (const value of ['12,345', ',123', '1,000', '0,000', '0,123456789012345678']) {
      expect(() => parseAmount(value, asset)).toThrow('hasta 2 decimales');
    }
    expect(parseAmount('12,00', asset)!.toFixed()).toBe('12');
    expect(parseAmount('12,', asset)!.toFixed()).toBe('12');
  });
  it.each(['ibit', 'ars', 'usd', 'usd_ccl'] as const)('al elegir %s, la entrada redondeada se puede volver a usar para calcular', asset => {
    const text = inputAmount(new Decimal('12.3456789'), asset);
    expect(text).toBe('12,35');
    expect(parseAmount(text, asset)!.toFixed()).toBe('12.35');
  });
  it.each(['cedear', 'ibit', 'ars', 'usd', 'usd_ccl'] as const)('%s muestra como máximo dos decimales sin ocultar cantidades pequeñas', asset => {
    expect(formatAmount(new Decimal('12.3456789'), asset)).toEqual({ text: '12,35', approximate: true });
    expect(formatAmount(new Decimal('0.001'), asset)).toEqual({ text: '< 0,01', approximate: true });
  });
  it('CEDEAR solo admite cantidades enteras sin separadores', () => {
    expect(parseAmount('123', 'cedear')!.toFixed()).toBe('123');
    expect(parseAmount('1000000000000', 'cedear')!.toFixed()).toBe('1000000000000');
    expect(() => parseAmount('12,5', 'cedear')).toThrow();
    expect(() => parseAmount('12.5', 'cedear')).toThrow();
    expect(hasDisallowedSeparator('12,5', 'cedear')).toBe(true);
    expect(hasDisallowedSeparator('12.5', 'cedear')).toBe(true);
    expect(inputAmount(new Decimal('12.5'), 'cedear')).toBe('13');
  });
  it.each(['-1', '1e6', '1.000,50', '1,000.50', '12.34', '100.000', '100000.50', '.5', 'abc', 'Infinity', '0,0000000000000000001', '1000000000001'])('ARS rechaza %s sin convertirlo silenciosamente', value => {
    expect(() => parseAmount(value, 'ars')).toThrow();
  });
  it('mantiene el separador correcto al cambiar de origen', () => {
    const value = new Decimal('0.0056');
    expect(inputAmount(value, 'btc')).toBe('0.0056');
    expect(parseAmount(inputAmount(value, 'btc'), 'btc')!.eq(value)).toBe(true);
    expect(inputAmount(new Decimal('12.5'), 'ibit')).toBe('12,5');
    expect(parseAmount(inputAmount(new Decimal('12.5'), 'ibit'), 'ibit')!.toFixed()).toBe('12.5');
    expect(formatAmount(new Decimal('52'), 'usd_ccl').text).toBe('52,00');
  });
  it.each([
    ['0.123456784', '0.12345678'],
    ['0.123456785', '0.12345679'],
    ['0.000000004', '0'],
    ['0.000000005', '0.00000001'],
    ['20999999.999999999', '21000000'],
  ])('al elegir BTC, convierte una equivalencia de %s en una entrada válida de %s', (value, expected) => {
    const text = inputAmount(new Decimal(value), 'btc');
    expect(text).toBe(expected);
    const amount = parseAmount(text, 'btc')!;
    expect(convert(amount, 'btc', rates).btc!.toFixed()).toBe(expected);
  });
  it('muestra BTC con ocho decimales y no oculta cantidades muy pequeñas como cero', () => {
    expect(formatAmount(new Decimal('0.0056'), 'btc')).toEqual({ text: '0.00560000', approximate: false });
    expect(formatAmount(new Decimal('0.000000001'), 'btc').text).toBe('< 0.00000001');
    expect(formatAmount(new Decimal('750000'), 'ars').text).toBe('750.000,00');
    expect(formatAmount(new Decimal('10.123456789'), 'ibit').approximate).toBe(true);
  });
  it('detecta informes con antigüedad mayor a siete días', () => {
    expect(isStale('2026-10-05', new Date('2026-10-06T12:00:00Z'))).toBe(false);
    expect(isStale('2026-10-05', new Date('2026-10-13T12:00:00Z'))).toBe(true);
  });
});

describe('validación de datos externos', () => {
  it('acepta fuentes conocidas y rechaza datos incompletos o inconsistentes', () => {
    expect(validateRates(rates)).toBe(rates);
    expect(() => validateRates({ ...rates, holdingsBtc: '0' })).toThrow();
    expect(() => validateRates({ ...rates, cedearsPerShare: '5' })).toThrow();
    expect(() => validateRates({ ...rates, sources: { ...SOURCES, quotes: 'https://example.com' } })).toThrow();
    expect(() => validateRates({ ...rates, cedearUsd: { price: '-1', fetchedAt: rates.fetchedAt } })).toThrow();
  });
});
