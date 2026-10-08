import { ratesEndpoint } from '../src/rates-endpoint.ts';
import { normalizeBasePath } from '../src/app-path.ts';
import { validateGlobalRates, validateRates } from '../src/rates.ts';
import { STALE_AFTER_MS } from '../shared/snapshot.ts';

const deployment = process.argv.includes('--deployment');
if (deployment && process.env.CONTEXT !== 'production') {
  console.log('Production gateway configuration is checked on production deploys.');
} else {
  try {
    const endpoint = ratesEndpoint(process.env.VITE_RATES_API_URL, normalizeBasePath(process.env.APP_BASE_PATH));
    if (!endpoint.startsWith('https://')) throw new Error('Configure VITE_RATES_API_URL with the public HTTPS Cloudflare gateway.');
    if (new URL(endpoint).hostname.endsWith('.netlify.app')) throw new Error('Rates must be served directly by Cloudflare, without a Netlify proxy.');
    if (!deployment) {
      const responses = await Promise.all(['global', 'ar'].map(async market => {
        const response = await fetch(`${endpoint}?market=${market}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
        if (!response.ok) throw new Error(`Gateway ${market} returned HTTP ${response.status}. Seed the snapshot before publication.`);
        const body = await response.json();
        return market === 'global' ? validateGlobalRates(body) : validateRates(body);
      }));
      for (const data of responses) {
        if (Date.now() - Date.parse(data.fetchedAt) > STALE_AFTER_MS) throw new Error('Stored rates have not been refreshed in 30 minutes.');
        if (Date.now() - Date.parse(`${data.asOf}T00:00:00Z`) > 7 * 86400_000) throw new Error('The fund report is older than 7 days.');
      }
      const [global, ar] = responses;
      if (!global.ibitUsd || Date.now() - Date.parse(global.ibitUsd.fetchedAt) > STALE_AFTER_MS) throw new Error('The stored IBIT USD quote is missing or was not refreshed.');
      if (Date.now() - Date.parse(global.ibitUsd.quotedAt) > 7 * 86400_000) throw new Error('The IBIT USD quote is older than 7 days.');
      for (const quote of [ar.cedearArs, ar.cedearUsd, ar.cedearUsdCcl]) {
        if (!quote || Date.now() - Date.parse(quote.fetchedAt) > STALE_AFTER_MS) throw new Error('Stored Argentine quotes are incomplete or were not refreshed.');
      }
    }
    console.log(deployment ? 'Production gateway configured. Builds do not contact market data providers.' : 'Both markets verified through the public gateway.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
