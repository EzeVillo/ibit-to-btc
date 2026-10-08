import { DurableObject } from 'cloudflare:workers';
import { appPath } from '../src/app-path.ts';
import { SnapshotCache } from '../shared/snapshot-cache.ts';
import type { CacheRecord } from '../shared/snapshot-cache.ts';
import { SNAPSHOT_KEY } from '../shared/snapshot.ts';
import { handleGateway } from './handler.ts';

interface Env {
  APP_BASE_PATH: string;
  ALLOWED_ORIGIN: string;
  RATES_KV: KVNamespace;
  RATES_COORDINATOR: DurableObjectNamespace<RatesCoordinator>;
  IP_LIMITER: RateLimit;
}

/** No public URL or update method: only the gateway binding can invoke this coordinator. */
export class RatesCoordinator extends DurableObject<Env> {
  private readonly cache: SnapshotCache;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cache = new SnapshotCache(() => env.RATES_KV.get(SNAPSHOT_KEY, { type: 'json', cacheTtl: 60 }),
      record => ctx.storage.put('cache', record));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<CacheRecord>('cache');
      try { this.cache.restore(saved); } catch { /* An outdated cache is replaced from KV. */ }
    });
  }

  async getSnapshot() { return this.cache.get(); }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleGateway(request, {
      apiPath: appPath(env.APP_BASE_PATH, 'api/rates'), allowedOrigin: env.ALLOWED_ORIGIN,
      limit: ip => env.IP_LIMITER.limit({ key: ip }),
      readSnapshot: () => env.RATES_COORDINATOR.getByName('public-rates-v1').getSnapshot(),
      cache: caches.default, waitUntil: promise => ctx.waitUntil(promise),
    });
  },
} satisfies ExportedHandler<Env>;
