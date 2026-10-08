import { describe, expect, it } from 'vitest';
import { csvRow, parseCedearRatio, parseHoldings, parseQuotes } from './sources';

const csv = `iShares Bitcoin Trust ETF
Fund Holdings as of,"Oct 05, 2026"
Shares Outstanding,"1,422,160,000.00"

Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Market Currency,Accrual Date
"BTC","BITCOIN","-","Alternative","68,712,220,343.18","100.00","68,712,220,343.18","806,037.57110","BTC","-"`;
const row = '<tr><td>ISHARES BITCOIN TRUST</td><td>Calificado</td><td>10:1</td><td>AR0626566167</td><td>8660</td><td>IBIT</td><td>IBIT</td></tr>';

describe('fuentes oficiales', () => {
  it('obtiene BTC y cuotas del mismo informe fechado, sin confundir valor de mercado con cantidad', () => {
    expect(parseHoldings(csv)).toEqual({ asOf: '2026-10-05', holdingsBtc: '806037.57110', sharesOutstanding: '1422160000.00' });
  });
  it('maneja CSV con comillas y falla si faltan campos esenciales', () => {
    expect(csvRow('"a,b","a""b",c')).toEqual(['a,b', 'a"b', 'c']);
    expect(() => parseHoldings(csv.replace('Shares Outstanding', 'Different field'))).toThrow();
    expect(() => parseHoldings(csv.replace('Oct 05, 2026', 'Feb 31, 2026'))).toThrow();
    expect(() => parseHoldings('<html>Error</html>')).toThrow();
  });
  it('lee el ratio de IBIT y permite futuros cambios publicados por Comafi', () => {
    expect(parseCedearRatio(row)).toEqual({ cedearRatio: '10:1', cedearsPerShare: '10' });
    expect(parseCedearRatio(row.replace('10:1', '20:1')).cedearsPerShare).toBe('20');
    expect(() => parseCedearRatio(row.replaceAll('IBIT', 'FXI'))).toThrow();
  });
  it('distingue IBIT en ARS, IBITD en MEP e IBITC en CCL', () => {
    const result = parseQuotes([{ symbol: 'IBIT', c: 7825 }, { symbol: 'IBITD', c: 5.09 }, { symbol: 'IBITC', c: 4.93 }], '2026-10-06T17:00:00Z');
    expect(result.cedearArs!.price).toBe('7825');
    expect(result.cedearUsd!.price).toBe('5.09');
    expect(result.cedearUsdCcl!.price).toBe('4.93');
  });
  it('no inventa CCL cuando IBITC no está disponible', () => {
    const result = parseQuotes([{ symbol: 'IBIT', c: 7825 }, { symbol: 'IBITD', c: 5.09 }], '2026-10-06T17:00:00Z');
    expect(result.cedearUsd!.price).toBe('5.09');
    expect(result.cedearUsdCcl).toBeNull();
  });
  it('marca cotizaciones faltantes o inválidas como no disponibles', () => {
    expect(parseQuotes([{ symbol: 'IBIT', c: 0 }], '2026-10-06T17:00:00Z')).toEqual({ cedearUsd: null, cedearUsdCcl: null, cedearArs: null });
    expect(() => parseQuotes({ error: 'Unreachable' }, '2026-10-06T17:00:00Z')).toThrow();
  });
});
