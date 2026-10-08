import { collectRates } from './sources.ts';
import { mergeSnapshot } from '../shared/snapshot.ts';
import type { SnapshotStore } from './snapshot-store.ts';

/** No automatic retries or public trigger. A failed cycle retains the previous timestamps. */
export async function refreshRates(store: SnapshotStore) {
  // Fail before contacting providers if storage is inaccessible: avoid spending quota on data we cannot publish.
  const previous = await store.read();
  const result = await collectRates();
  if (result.ar.status === 'rejected' && result.global.status === 'rejected') throw new Error('All source updates failed. Stored rates retained.');
  const snapshot = mergeSnapshot(previous, result.ar.status === 'fulfilled' ? result.ar.value : null,
    result.global.status === 'fulfilled' ? result.global.value : null);
  await store.write(snapshot);
  return { snapshot, arUpdated: result.ar.status === 'fulfilled', globalUpdated: result.global.status === 'fulfilled',
    quotesUpdated: {
      ar: result.ar.status === 'fulfilled' && Boolean(result.ar.value.cedearArs && result.ar.value.cedearUsd && result.ar.value.cedearUsdCcl),
      global: result.global.status === 'fulfilled' && Boolean(result.global.value.ibitUsd),
    },
  };
}
