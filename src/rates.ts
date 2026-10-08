import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export interface Rates {
  asOf: string;
  fetchedAt: string;
  holdingsBtc: string;
  sharesOutstanding: string;
  cedearsPerShare: string;
  cedearRatio: string;
  cedearUsd: { price: string; fetchedAt: string } | null;
  cedearUsdCcl: { price: string; fetchedAt: string } | null;
  cedearArs: { price: string; fetchedAt: string } | null;
  sources: { fund: string; holdings: string; cedear: string; quotes: string };
}

export interface GlobalRates {
  market: 'global';
  asOf: string;
  fetchedAt: string;
  holdingsBtc: string;
  sharesOutstanding: string;
  ibitUsd: { price: string; fetchedAt: string; quotedAt: string } | null;
  quoteStatus: 'available' | 'unavailable' | 'not_configured';
  sources: { fund: string; holdings: string; quotes: string };
}

export type AnyRates = Rates | GlobalRates;

export function isGlobalRates(rates: AnyRates): rates is GlobalRates {
  return 'market' in rates && rates.market === 'global';
}

export const SOURCES = {
  fund: 'https://www.ishares.com/us/products/333011/ishares-bitcoin-trust-etf',
  holdings: 'https://www.ishares.com/us/products/333011/ishares-bitcoin-trust-etf/latest-holdings.csv',
  cedear: 'https://www.comafi.com.ar/custodiaglobal/Programas-CEDEARs-2483.note.aspx',
  quotes: 'https://data912.com/live/arg_cedears',
} as const;

export const GLOBAL_SOURCES = {
  fund: SOURCES.fund,
  holdings: SOURCES.holdings,
  quotes: 'https://finnhub.io/docs/api/quote',
} as const;

export function validateGlobalRates(value: unknown): GlobalRates {
  if (!value || typeof value !== 'object') throw new Error('Invalid fund data.');
  const data = value as Partial<GlobalRates>;
  if (data.market !== 'global' || typeof data.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf)
    || !Number.isFinite(Date.parse(`${data.asOf}T00:00:00Z`))
    || new Date(`${data.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== data.asOf
    || !validTimestamp(data.fetchedAt)) throw new Error('Invalid fund date.');
  for (const key of ['holdingsBtc', 'sharesOutstanding'] as const) {
    if (typeof data[key] !== 'string' || !/^\d+(?:\.\d+)?$/.test(data[key]!)
      || !new Decimal(data[key]!).gt(0) || new Decimal(data[key]!).gt('1000000000000000')) {
      throw new Error('Invalid fund equivalent.');
    }
  }
  const perShare = new Decimal(data.holdingsBtc!).div(data.sharesOutstanding!);
  if (!perShare.gt(0) || perShare.gte(1)) throw new Error('Invalid IBIT equivalent.');
  if (!data.sources || Object.entries(GLOBAL_SOURCES).some(([key, url]) => data.sources![key as keyof typeof GLOBAL_SOURCES] !== url)) {
    throw new Error('Unverified data source.');
  }
  if (!['available', 'unavailable', 'not_configured'].includes(data.quoteStatus ?? '')) throw new Error('Invalid quote status.');
  if (data.ibitUsd !== null) {
    const quote = data.ibitUsd;
    if (!quote || typeof quote.price !== 'string' || !/^\d+(?:\.\d+)?$/.test(quote.price)
      || !new Decimal(quote.price).gt(0) || new Decimal(quote.price).gt('1000000000')
      || !validTimestamp(quote.fetchedAt) || !validTimestamp(quote.quotedAt)
      || Date.parse(quote.quotedAt) > Date.parse(quote.fetchedAt) + 5 * 60_000
      || data.quoteStatus !== 'available') throw new Error('Invalid IBIT quote.');
  } else if (data.quoteStatus === 'available') throw new Error('Missing IBIT quote.');
  return data as GlobalRates;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function validateRates(value: unknown): Rates {
  if (!value || typeof value !== 'object') throw new Error('Datos de equivalencia inválidos.');
  if ('market' in value && value.market !== 'ar') throw new Error('Datos de mercado argentino inválidos.');
  const data = value as Partial<Rates>;
  if (typeof data.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf)
    || !Number.isFinite(Date.parse(`${data.asOf}T00:00:00Z`))
    || typeof data.fetchedAt !== 'string' || !Number.isFinite(Date.parse(data.fetchedAt))) {
    throw new Error('La fuente no incluyó una fecha válida.');
  }
  if (new Date(`${data.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== data.asOf) {
    throw new Error('La fecha del informe no es válida.');
  }
  for (const key of ['holdingsBtc', 'sharesOutstanding', 'cedearsPerShare'] as const) {
    if (typeof data[key] !== 'string' || !/^\d+(?:\.\d+)?$/.test(data[key]!)) {
      throw new Error('La fuente no incluyó una equivalencia válida.');
    }
    const number = new Decimal(data[key]!);
    if (!number.isFinite() || !number.gt(0) || number.gt('1000000000000000')) {
      throw new Error('La fuente no incluyó una equivalencia válida.');
    }
  }
  if (typeof data.cedearRatio !== 'string' || !/^\d+:\d+$/.test(data.cedearRatio)
    || !data.sources || data.sources.fund !== SOURCES.fund || data.sources.quotes !== SOURCES.quotes
    || data.sources.holdings !== SOURCES.holdings || data.sources.cedear !== SOURCES.cedear) {
    throw new Error('No se pudo verificar la fuente de las equivalencias.');
  }
  const btcPerShare = new Decimal(data.holdingsBtc!).div(data.sharesOutstanding!);
  if (!btcPerShare.gt(0) || btcPerShare.gte(1)) throw new Error('La equivalencia de IBIT no es válida.');
  const [cedearUnits, shareUnits] = data.cedearRatio.split(':');
  if (!new Decimal(shareUnits).gt(0) || !new Decimal(cedearUnits).div(shareUnits).eq(data.cedearsPerShare!)) {
    throw new Error('El ratio de CEDEAR no coincide con su equivalencia.');
  }
  for (const key of ['cedearUsd', 'cedearUsdCcl', 'cedearArs'] as const) {
    const quote = data[key];
    if (quote === null) continue;
    if (!quote || typeof quote.price !== 'string' || !/^\d+(?:\.\d+)?$/.test(quote.price)
      || !new Decimal(quote.price).gt(0) || new Decimal(quote.price).gt('1000000000')
      || typeof quote.fetchedAt !== 'string' || !Number.isFinite(Date.parse(quote.fetchedAt))) {
      throw new Error('La cotización del CEDEAR no es válida.');
    }
  }
  return data as Rates;
}
