import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { refreshRates } from '../server/refresh-rates.ts';
import { cloudflareSnapshotStore } from '../server/snapshot-store.ts';
import { LOCAL_SNAPSHOT_PATH } from '../server/local-rates.ts';
import { validateSnapshot } from '../shared/snapshot.ts';

const store = process.argv.includes('--cloudflare') ? cloudflareSnapshotStore() : {
  async read() {
    try { return validateSnapshot(JSON.parse(await readFile(LOCAL_SNAPSHOT_PATH, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  async write(snapshot) {
    await mkdir(dirname(LOCAL_SNAPSHOT_PATH), { recursive: true });
    const staging = `${LOCAL_SNAPSHOT_PATH}.${process.pid}.tmp`;
    await writeFile(staging, JSON.stringify(snapshot, null, 2));
    await rename(staging, LOCAL_SNAPSHOT_PATH);
  },
};
try {
  if (!process.env.FINNHUB_API_KEY?.trim()) throw new Error('Configure FINNHUB_API_KEY before refreshing rates.');
  const result = await refreshRates(store);
  console.log(`Snapshot updated: Argentina ${result.arUpdated ? 'updated' : 'retained'}, international ${result.globalUpdated ? 'updated' : 'retained'}.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
