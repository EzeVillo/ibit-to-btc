import { cloudflareSnapshotStore } from '../../server/snapshot-store.ts';
import { refreshRates } from '../../server/refresh-rates.ts';

/** Netlify Scheduled Functions have no publicly invocable URL. */
export default async function refresh() {
  if (!process.env.FINNHUB_API_KEY?.trim()) throw new Error('FINNHUB_API_KEY is required for scheduled updates.');
  const result = await refreshRates(cloudflareSnapshotStore());
  console.log('Rates snapshot updated.', { arUpdated: result.arUpdated, globalUpdated: result.globalUpdated, quotesUpdated: result.quotesUpdated });
  if (!result.quotesUpdated.ar || !result.quotesUpdated.global) {
    console.warn('Some market data could not be updated; check provider availability and stored timestamps.');
  }
}

export const config = { schedule: '*/15 * * * *' };
