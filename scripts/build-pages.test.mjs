import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPages } from './build-pages.mjs';

const directories = [];
afterEach(async () => {
  for (const path of directories.splice(0)) {
    const target = resolve(path);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ibit-pages-')) {
      throw new Error('Test cleanup must stay inside its temporary build directory.');
    }
    await rm(target, { recursive: true, force: true });
  }
});
async function fixture(basePath) {
  const distDirectory = await mkdtemp(join(tmpdir(), 'ibit-pages-'));
  directories.push(distDirectory);
  await mkdir(join(distDirectory, 'assets'));
  await writeFile(join(distDirectory, 'assets', 'app.js'), 'example bundle');
  await writeFile(join(distDirectory, 'theme.js'), 'example theme');
  await writeFile(join(distDirectory, 'favicon.svg'), '<svg/>');
  await writeFile(join(distDirectory, 'index.html'), `<html lang="en"><head><title>Original</title><meta name="description" content="Original" /><script src="${basePath}theme.js"></script><script type="module" src="${basePath}assets/app.js"></script></head><body><noscript>Original</noscript></body></html>`);
  return distDirectory;
}

describe('deployment below a project path', () => {
  it.each(['/', '/ibit-to-btc/', '/tools/converter/', '/assets/'])('mounts files and generates matching pages, API routing and SEO at %s', async basePath => {
    const distDirectory = await fixture(basePath);
    await buildPages({ distDirectory, basePath, siteUrl: 'https://ezevillo.com', context: 'production', gatewayUrl: 'https://rates.workers.dev/ibit-to-btc/api/rates' });
    const appDirectory = join(distDirectory, basePath.slice(1));
    const page = await readFile(join(appDirectory, 'index.html'), 'utf8');
    const ar = await readFile(join(appDirectory, 'ar', 'index.html'), 'utf8');
    expect(page).toContain(`<link rel="canonical" href="https://ezevillo.com${basePath}"`);
    expect(ar).toContain('lang="es-AR"');
    expect(ar).toContain(`<link rel="canonical" href="https://ezevillo.com${basePath}ar/"`);
    expect(ar).toContain(`hreflang="en" href="https://ezevillo.com${basePath}"`);
    expect(ar).toContain(`src="${basePath}assets/app.js"`);
    expect(page).not.toContain('noindex');
    expect(await readFile(join(appDirectory, 'assets', 'app.js'), 'utf8')).toBe('example bundle');
    expect(await readFile(join(appDirectory, 'theme.js'), 'utf8')).toBe('example theme');
    const rules = await readFile(join(distDirectory, '_redirects'), 'utf8');
    expect(rules).not.toContain('/.netlify/functions/rates');
    expect(rules).not.toContain('api/rates');
    expect(rules).toContain(`${basePath}ar ${basePath}ar/ 301`);
    if (basePath !== '/') expect(rules).toContain(`${basePath.slice(0, -1)} ${basePath} 301`);
    const sitemap = await readFile(join(appDirectory, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain(`<loc>https://ezevillo.com${basePath}ar/</loc>`);
    expect(await readFile(join(distDirectory, 'robots.txt'), 'utf8')).toContain(`Sitemap: https://ezevillo.com${basePath}sitemap.xml`);
    expect(await readFile(join(distDirectory, '_headers'), 'utf8')).toContain(`${basePath}assets/*`);
    expect(await readFile(join(distDirectory, '_headers'), 'utf8')).toContain("connect-src 'self' https://rates.workers.dev");
    expect((await readdir(distDirectory)).some(name => name.startsWith('.mount-'))).toBe(false);
    if (basePath !== '/') expect(await readdir(distDirectory)).not.toContain('index.html');
  });
  it('prevents previews from being indexed, including static assets', async () => {
    const distDirectory = await fixture('/ibit-to-btc/');
    await buildPages({ distDirectory, basePath: '/ibit-to-btc/', siteUrl: 'https://ezevillo.com', context: 'deploy-preview' });
    expect(await readFile(join(distDirectory, 'ibit-to-btc', 'index.html'), 'utf8')).toContain('noindex, nofollow');
    expect(await readFile(join(distDirectory, 'robots.txt'), 'utf8')).toContain('Disallow: /');
    expect(await readFile(join(distDirectory, '_headers'), 'utf8')).toContain('X-Robots-Tag: noindex, nofollow');
    expect(await readdir(join(distDirectory, 'ibit-to-btc'))).not.toContain('sitemap.xml');
  });
  it.each(['https://ezevillo.com/ibit-to-btc/', 'http://ezevillo.com', 'https://user:password@ezevillo.com', 'https://ezevillo.com?x=1'])('rejects invalid SITE_URL %s before moving files', async siteUrl => {
    const distDirectory = await fixture('/ibit-to-btc/');
    await expect(buildPages({ distDirectory, siteUrl, context: 'production' })).rejects.toThrow('SITE_URL');
    expect(await readdir(distDirectory)).toContain('index.html');
  });
  it('requires an origin for production and validates paths before moving files', async () => {
    const distDirectory = await fixture('/ibit-to-btc/');
    await expect(buildPages({ distDirectory, context: 'production' })).rejects.toThrow('SITE_URL');
    await expect(buildPages({ distDirectory, basePath: '/../', siteUrl: 'https://ezevillo.com' })).rejects.toThrow('APP_BASE_PATH');
    expect(await readdir(distDirectory)).toContain('index.html');
  });
});
