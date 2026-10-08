import { readFile, mkdir, writeFile, readdir, mkdtemp, rename, rmdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { appPath, normalizeBasePath } from '../src/app-path.ts';
import { ratesEndpoint } from '../src/rates-endpoint.ts';

const escape = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** Mount a fresh Vite build and generate pages and Netlify routing for its prefix. */
export async function buildPages({ distDirectory, basePath, siteUrl, context, gatewayUrl }) {
  const prefix = normalizeBasePath(basePath);
  const dist = resolve(distDirectory);
  const appDirectory = resolve(dist, `.${prefix}`);
  if (appDirectory !== dist && !appDirectory.startsWith(`${dist}${sep}`)) throw new Error('Application path must stay inside dist.');
  let origin;
  if (siteUrl) {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('SITE_URL must be an HTTPS origin, without path, credentials or query.');
    }
    origin = parsed.origin;
  }
  if (context === 'production' && !origin) throw new Error('Configure SITE_URL for production.');
  const endpoint = ratesEndpoint(gatewayUrl, prefix);
  if (context === 'production' && !endpoint.startsWith('https://')) throw new Error('Configure VITE_RATES_API_URL for production.');
  const gatewayOrigin = gatewayUrl?.trim() ? new URL(endpoint).origin : '';
  const isPreview = Boolean(context && context !== 'production');
  const messages = JSON.parse(await readFile(new URL('../src/messages.json', import.meta.url), 'utf8'));
  const template = await readFile(join(dist, 'index.html'), 'utf8');

  if (appDirectory !== dist) {
    // Stage first so even a prefix named /assets/ cannot collide with Vite's assets.
    const entries = await readdir(dist);
    const stage = await mkdtemp(join(dist, '.mount-'));
    for (const entry of entries) await rename(join(dist, entry), join(stage, entry));
    await mkdir(appDirectory, { recursive: true });
    for (const entry of entries) await rename(join(stage, entry), join(appDirectory, entry));
    await rmdir(stage);
  }

  const globalPath = appPath(prefix);
  const arPath = appPath(prefix, 'ar/');
  for (const market of ['global', 'ar']) {
    const lang = market === 'ar' ? 'es' : 'en';
    const suffix = market === 'ar' ? 'Ar' : 'Global';
    const url = market === 'ar' ? arPath : globalPath;
    let page = template.replace(/<html lang="[^"]+"/, `<html lang="${market === 'ar' ? 'es-AR' : 'en'}"`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(messages[`pageTitle${suffix}`][lang])}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(messages[`pageDescription${suffix}`][lang])}" />`)
      .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript>${escape(messages[`noscript${suffix}`][lang])}</noscript>`);
    const metadata = origin ? `<link rel="canonical" href="${origin}${url}" />
    <link rel="alternate" hreflang="en" href="${origin}${globalPath}" />
    <link rel="alternate" hreflang="es-AR" href="${origin}${arPath}" />
    <link rel="alternate" hreflang="x-default" href="${origin}${globalPath}" />` : '';
    page = page.replace('</head>', `${metadata}${isPreview ? '<meta name="robots" content="noindex, nofollow" />' : ''}\n  </head>`);
    if (market === 'ar') await mkdir(join(appDirectory, 'ar'), { recursive: true });
    await writeFile(join(appDirectory, market === 'ar' ? 'ar/index.html' : 'index.html'), page);
  }

  const sitemapUrl = origin ? `${origin}${appPath(prefix, 'sitemap.xml')}` : null;
  if (origin && !isPreview) {
    await writeFile(join(appDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}${globalPath}</loc></url><url><loc>${origin}${arPath}</loc></url></urlset>\n`);
  }
  await writeFile(join(dist, 'robots.txt'), isPreview ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n${sitemapUrl ? `Sitemap: ${sitemapUrl}\n` : ''}`);
  const redirects = [
    ...(prefix === '/' ? [] : [`${prefix.slice(0, -1)} ${prefix} 301`]),
    `${appPath(prefix, 'ar')} ${arPath} 301`,
  ];
  await writeFile(join(dist, '_redirects'), `${redirects.join('\n')}\n`);
  const csp = `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'${gatewayOrigin ? ` ${gatewayOrigin}` : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`;
  await writeFile(join(dist, '_headers'), `${appPath(prefix, '*')}\n  Content-Security-Policy: ${csp}\n${appPath(prefix, 'assets/*')}\n  Cache-Control: public, max-age=31536000, immutable\n${isPreview ? '/*\n  X-Robots-Tag: noindex, nofollow\n' : ''}`);
  console.log(`Built ${globalPath} and ${arPath}; gateway ${endpoint}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = loadEnv('production', process.cwd(), '');
  await buildPages({
    distDirectory: fileURLToPath(new URL('../dist/', import.meta.url)),
    basePath: env.APP_BASE_PATH,
    siteUrl: env.SITE_URL || env.URL,
    context: process.env.CONTEXT,
    gatewayUrl: env.VITE_RATES_API_URL,
  });
}
