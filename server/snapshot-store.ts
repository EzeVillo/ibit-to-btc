import { SNAPSHOT_KEY, validateSnapshot } from '../shared/snapshot.ts';
import type { RatesSnapshot } from '../shared/snapshot.ts';

export interface SnapshotStore {
  read(): Promise<RatesSnapshot | null>;
  write(snapshot: RatesSnapshot): Promise<void>;
}

export function cloudflareSnapshotStore(env = process.env): SnapshotStore {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const namespace = env.CLOUDFLARE_KV_NAMESPACE_ID?.trim();
  const token = env.CLOUDFLARE_KV_API_TOKEN?.trim();
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !namespace || !/^[a-f0-9]{32}$/i.test(namespace) || !token) {
    throw new Error('Configure Cloudflare KV account, namespace and API token.');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(SNAPSHOT_KEY)}`;
  const headers = { Authorization: `Bearer ${token}` };
  return {
    async read() {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(5_000), redirect: 'error' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`KV read failed (${response.status}).`);
      return validateSnapshot(await response.json());
    },
    async write(snapshot) {
      const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: JSON.stringify(validateSnapshot(snapshot)), signal: AbortSignal.timeout(5_000), redirect: 'error' });
      if (!response.ok) throw new Error(`KV write failed (${response.status}).`);
      const result = await response.json() as { success?: unknown };
      if (result.success !== true) throw new Error('KV did not confirm the update.');
    },
  };
}
