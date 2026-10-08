import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fixture } from '../shared/test-fixtures.ts';
import { SNAPSHOT_KEY } from '../shared/snapshot.ts';

const runtime = new Miniflare(convertV4MiniflareOptions({
  name: 'ibit-rates-gateway', modules: true, scriptPath: resolve('work/gateway-build/worker.js'),
  compatibilityDate: '2026-10-08',
  bindings: { APP_BASE_PATH: '/ibit-to-btc/', ALLOWED_ORIGIN: 'https://ezevillo.com' },
  kvNamespaces: ['RATES_KV'],
  durableObjects: { RATES_COORDINATOR: { className: 'RatesCoordinator', useSQLite: true } },
  ratelimits: { IP_LIMITER: { namespace_id: '781013', simple: { limit: 60, period: 60 } } },
}));
try {
  const kv = await runtime.getKVNamespace('RATES_KV');
  await kv.put(SNAPSHOT_KEY, JSON.stringify(fixture()));
  const responses = await Promise.all(Array.from({ length: 100 }, (_, index) => runtime.dispatchFetch(
    `https://gateway.test/ibit-to-btc/api/rates?market=${index % 2 ? 'ar' : 'global'}`, {
      headers: { Origin: 'https://ezevillo.com', 'CF-Connecting-IP': `192.0.2.${index + 1}` },
    })));
  assert(responses.every(response => response.status === 200), 'All 100 cold requests must succeed.');
  const bodies = await Promise.all(responses.map(response => response.json()));
  for (let i = 0; i < bodies.length; i++) assert.deepEqual(bodies[i], i % 2 ? fixture().ar : fixture().global);
  const objects = await runtime.listDurableObjectIds('RatesCoordinator');
  assert.equal(objects.length, 1, 'Both markets and all visitors must use the same globally named coordinator.');
  assert.equal((await runtime.dispatchFetch('https://gateway.test/update', { method: 'POST' })).status, 404);
  assert.equal((await runtime.dispatchFetch('https://gateway.test/ibit-to-btc/api/rates?bust=1')).status, 400);
  const forbidden = await runtime.dispatchFetch('https://gateway.test/ibit-to-btc/api/rates', { headers: { Origin: 'https://attacker.test' } });
  assert.equal(forbidden.status, 403);
  const limited = await Promise.all(Array.from({ length: 70 }, () => runtime.dispatchFetch('https://gateway.test/ibit-to-btc/api/rates', {
    headers: { 'CF-Connecting-IP': '198.51.100.1' },
  })));
  assert(limited.some(response => response.status === 429), 'The configured rate limiter must reject excess requests.');
  console.log('Cloudflare runtime verified: 100 simultaneous requests, both markets, one private Durable Object, CORS and rate limiting.');
} finally { await runtime.dispose(); }
