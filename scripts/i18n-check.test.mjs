import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateTranslations } from './i18n-check.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const old = { title: { es: digest('Hola {name}'), en: digest('Hello {name}') } };
const original = { title: { es: 'Hola {name}', en: 'Hello {name}' } };

describe('mandatory bilingual updates', () => {
  it('accepts the reviewed pair and blocks changing either language alone', () => {
    expect(validateTranslations(original, old)).toEqual([]);
    for (const changed of [{ title: { es: 'Bienvenido {name}', en: 'Hello {name}' } }, { title: { es: 'Hola {name}', en: 'Welcome {name}' } }]) {
      expect(validateTranslations(changed, old).length).toBeGreaterThan(0);
      expect(validateTranslations(changed, old, true).join(' ')).toContain('only one language changed');
    }
  });
  it('requires explicit review even after both languages have changed', () => {
    const changed = { title: { es: 'Bienvenido {name}', en: 'Welcome {name}' } };
    expect(validateTranslations(changed, old).length).toBeGreaterThan(0);
    expect(validateTranslations(changed, old, true)).toEqual([]);
  });
  it('rejects missing text and mismatched parameters, including review attempts', () => {
    for (const entry of [{ es: 'Hola', en: '' }, { es: 'Hola' }, { es: 'Hola {name}', en: 'Hello {other}' }]) expect(validateTranslations({ title: entry }, {}, true).length).toBeGreaterThan(0);
  });
  it('requires review for additions and removals', () => {
    expect(validateTranslations(original, {}).length).toBeGreaterThan(0); expect(validateTranslations({}, old).length).toBeGreaterThan(0);
    expect(validateTranslations(original, {}, true)).toEqual([]);
  });
});
