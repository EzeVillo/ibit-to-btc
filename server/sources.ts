import Decimal from 'decimal.js';
import { GLOBAL_SOURCES, SOURCES, validateGlobalRates, validateRates } from '../src/rates.ts';
import type { GlobalRates, Rates } from '../src/rates.ts';

/** Quoted CSV fields are necessary because issuer numbers contain commas. */
export function csvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('El archivo de iShares está incompleto.');
  cells.push(cell.trim());
  return cells;
}

export function parseHoldings(csv: string): Pick<Rates, 'asOf' | 'holdingsBtc' | 'sharesOutstanding'> {
  const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(csvRow);
  const date = rows.find(row => row[0] === 'Fund Holdings as of')?.[1];
  const shares = rows.find(row => row[0] === 'Shares Outstanding')?.[1];
  const headerIndex = rows.findIndex(row => row[0] === 'Ticker' && row.includes('Quantity'));
  const header = rows[headerIndex];
  const btc = rows.slice(headerIndex + 1).find(row => row[0] === 'BTC' && row[1] === 'BITCOIN');
  if (!date || !shares || headerIndex < 0 || !btc) throw new Error('Faltan datos en el archivo de iShares.');
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(date);
  if (!match) throw new Error('La fecha de iShares no es válida.');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = String(months.indexOf(match[1]) + 1).padStart(2, '0');
  const asOf = `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
  if (new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) throw new Error('La fecha de iShares no es válida.');
  return { asOf, holdingsBtc: btc[header.indexOf('Quantity')].replaceAll(',', ''), sharesOutstanding: shares.replaceAll(',', '') };
}

export function parseCedearRatio(html: string): Pick<Rates, 'cedearRatio' | 'cedearsPerShare'> {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(match => match[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells[0] !== 'ISHARES BITCOIN TRUST' || cells[5] !== 'IBIT' || cells[6] !== 'IBIT') continue;
    const ratio = /^(\d+)\s*:\s*(\d+)$/.exec(cells[2]);
    if (!ratio || Number(ratio[1]) <= 0 || Number(ratio[2]) <= 0) throw new Error('El ratio de Comafi no es válido.');
    return { cedearRatio: `${ratio[1]}:${ratio[2]}`, cedearsPerShare: new Decimal(ratio[1]).div(ratio[2]).toFixed() };
  }
  throw new Error('No se encontró el programa de CEDEAR de IBIT en Comafi.');
}

async function getSource(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/csv, text/html;q=0.9, */*;q=0.5', ...extraHeaders },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`La fuente no respondió correctamente (${response.status}).`);
  const content = await response.text();
  if (content.length > 2_000_000) throw new Error('La fuente devolvió un archivo demasiado grande.');
  return content;
}

/** Finnhub /quote: c is the share price; t is the provider's Unix quote timestamp. */
export function parseIbitQuote(value: unknown, fetchedAt: string): NonNullable<GlobalRates['ibitUsd']> {
  if (!value || typeof value !== 'object') throw new Error('Invalid IBIT quote response.');
  const quote = value as { c?: unknown; t?: unknown; error?: unknown };
  if (quote.error || typeof quote.c !== 'number' || !Number.isFinite(quote.c) || quote.c <= 0 || quote.c > 1_000_000_000
    || typeof quote.t !== 'number' || !Number.isSafeInteger(quote.t) || quote.t <= 0
    || quote.t * 1000 > Date.parse(fetchedAt) + 5 * 60_000) throw new Error('Invalid IBIT price or timestamp.');
  const quotedAt = new Date(quote.t * 1000).toISOString();
  return { price: new Decimal(quote.c).toFixed(), fetchedAt, quotedAt };
}

export async function fetchGlobalRates(holdingsRequest = getSource(GLOBAL_SOURCES.holdings)): Promise<GlobalRates> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  // Only fixed sources and symbol. Secrets are sent in a server-side header, never in public URLs.
  const quoteRequest = apiKey
    ? getSource('https://finnhub.io/api/v1/quote?symbol=IBIT', { Accept: 'application/json', 'X-Finnhub-Token': apiKey })
      .then(body => parseIbitQuote(JSON.parse(body), new Date().toISOString())).catch(() => null)
    : Promise.resolve(null);
  const [holdings, ibitUsd] = await Promise.all([holdingsRequest, quoteRequest]);
  return validateGlobalRates({ ...parseHoldings(holdings), market: 'global', ibitUsd,
    quoteStatus: ibitUsd ? 'available' : apiKey ? 'unavailable' : 'not_configured',
    fetchedAt: new Date().toISOString(), sources: GLOBAL_SOURCES });
}

export function parseQuotes(value: unknown, fetchedAt: string): Pick<Rates, 'cedearUsd' | 'cedearUsdCcl' | 'cedearArs'> {
  if (!Array.isArray(value)) throw new Error('El proveedor no devolvió cotizaciones válidas.');
  const entries: unknown[] = value;
  function quote(symbol: string): Rates['cedearArs'] {
    const entry = entries.find(row => row && typeof row === 'object' && 'symbol' in row && row.symbol === symbol);
    if (!entry || typeof entry !== 'object' || !('c' in entry) || typeof entry.c !== 'number' || !Number.isFinite(entry.c) || entry.c <= 0) return null;
    return { price: String(entry.c), fetchedAt };
  }
  return { cedearUsd: quote('IBITD'), cedearUsdCcl: quote('IBITC'), cedearArs: quote('IBIT') };
}

export async function fetchRates(holdingsRequest = getSource(SOURCES.holdings)): Promise<Rates> {
  const [holdings, cedear, quotes] = await Promise.all([
    holdingsRequest, getSource(SOURCES.cedear),
    getSource(SOURCES.quotes).then(text => parseQuotes(JSON.parse(text), new Date().toISOString()))
      .catch(() => ({ cedearUsd: null, cedearUsdCcl: null, cedearArs: null })),
  ]);
  return validateRates({
    ...parseHoldings(holdings),
    ...parseCedearRatio(cedear),
    ...quotes,
    fetchedAt: new Date().toISOString(),
    sources: SOURCES,
  });
}

/** A scheduled cycle queries each of the four providers once; failures stay isolated by market. */
export async function collectRates() {
  const holdings = getSource(SOURCES.holdings);
  const [ar, global] = await Promise.allSettled([fetchRates(holdings), fetchGlobalRates(holdings)]);
  return { ar, global };
}
