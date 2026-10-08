import { defineConfig, loadEnv } from 'vite';
import type { Connect, Plugin } from 'vite';
import { handleLocalRates } from './server/local-rates.ts';
import { ratesEndpoint } from './src/rates-endpoint.ts';
import { marketFromPath } from './src/market.ts';
import { translator } from './src/i18n.ts';
import { html } from './src/view.ts';
import { appPath, normalizeBasePath, pathWithinApp } from './src/app-path.ts';
import { resolve } from 'node:path';

function ratesApi(basePath: string): Plugin {
  const apiMiddleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url?.split('?')[0] !== appPath(basePath, 'api/rates')) return next();
    const response = await handleLocalRates(new Request(`http://localhost${req.url}`, { method: req.method }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
  return {
    name: 'local-rates-api',
    configureServer(server) { server.middlewares.use(apiMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(apiMiddleware); },
  };
}

function localizedHtml(basePath: string): Plugin {
  return {
    name: 'localized-html',
    transformIndexHtml(source, context) {
      const path = context.originalUrl?.split('?')[0] ?? context.path;
      // Vite can supply the original URL or the path after removing its base.
      const market = marketFromPath(pathWithinApp(path, basePath) ?? path);
      const t = translator(market);
      return source.replaceAll('__APP_LANG__', market === 'ar' ? 'es-AR' : 'en')
        .replaceAll('__APP_TITLE__', html(t(market === 'ar' ? 'pageTitleAr' : 'pageTitleGlobal')))
        .replaceAll('__APP_DESCRIPTION__', html(t(market === 'ar' ? 'pageDescriptionAr' : 'pageDescriptionGlobal')))
        .replaceAll('__APP_NOSCRIPT__', html(t(market === 'ar' ? 'noscriptAr' : 'noscriptGlobal')));
    },
  };
}

export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(env.APP_BASE_PATH);
  ratesEndpoint(env.VITE_RATES_API_URL, base);
  return {
    base,
    plugins: [ratesApi(base), localizedHtml(base)],
    // build-pages mounts the generated files below base; preview serves that directory.
    build: { target: 'es2022', outDir: isPreview ? resolve('dist', `.${base}`) : 'dist' },
  };
});
