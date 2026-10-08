import { assetsFor } from './conversion';
import { translator } from './i18n';
import type { Market } from './market';

interface ModelContext {
  registerTool(tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options: { signal: AbortSignal }): void | Promise<void>;
}

export function registerConversionTool(execute: (input: unknown) => unknown, market: Market = 'ar'): void {
  const t = translator(market);
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    void Promise.resolve(context.registerTool({
      name: 'convert_ibit_exposure',
      title: t('toolTitle'),
      description: t(market === 'ar' ? 'toolDescriptionAr' : 'toolDescriptionGlobal'),
      inputSchema: {
        type: 'object', additionalProperties: false,
        properties: {
          asset: { type: 'string', enum: assetsFor(market) },
          amount: { type: 'string', minLength: 1, maxLength: 48, description: t(market === 'ar' ? 'toolAmountAr' : 'toolAmountGlobal') },
        }, required: ['asset', 'amount'],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false }, execute,
    }, { signal: lifecycle.signal })).catch(() => { /* Optional browser capability. */ });
  } catch { /* Normal conversion remains available in unsupported browsers. */ }
}
