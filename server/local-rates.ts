import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SnapshotCache } from '../shared/snapshot-cache.ts';
import { apiError, requestMarket, snapshotResponse } from '../shared/rates-http.ts';

export const LOCAL_SNAPSHOT_PATH = resolve('work/rates-snapshot.json');
const cache = new SnapshotCache(async () => JSON.parse(await readFile(LOCAL_SNAPSHOT_PATH, 'utf8')));

/** Local development reads a manually refreshed snapshot, just like the public gateway. */
export async function handleLocalRates(request: Request): Promise<Response> {
  const market = requestMarket(request);
  if (market instanceof Response) return market;
  try { return snapshotResponse(await cache.get(), market); }
  catch { return apiError(503, 'SOURCES_UNAVAILABLE', { 'Retry-After': '60' }); }
}
