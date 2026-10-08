import messages from './messages.json' with { type: 'json' };
import type { Market } from './market.ts';

export type MessageKey = keyof typeof messages;
export type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

export function translator(market: Market): Translator {
  const language = market === 'ar' ? 'es' : 'en';
  return (key, values = {}) => messages[key][language].replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!(name in values)) throw new Error(`Missing translation parameter: ${key}.${name}`);
    return String(values[name]);
  });
}
