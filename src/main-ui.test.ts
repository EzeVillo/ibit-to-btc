// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsFor, getAmountInputRules } from './conversion';
import type { Asset } from './conversion';
import type { Market } from './market';
import { fixture } from '../shared/test-fixtures';

const { requestRates, registerTool } = vi.hoisted(() => ({ requestRates: vi.fn(), registerTool: vi.fn() }));
vi.mock('./rates-client', async importOriginal => ({ ...await importOriginal<object>(), requestRates }));
vi.mock('./webmcp', () => ({ registerConversionTool: registerTool }));

const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const amount = () => field<HTMLInputElement>('amount');
const price = () => field<HTMLInputElement>('cost-price');

function enter(input: HTMLInputElement, value: string, inputType = 'insertReplacementText') {
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
}

function type(input: HTMLInputElement, text: string) {
  const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text });
  input.dispatchEvent(before);
  if (!before.defaultPrevented) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.setSelectionRange(start + text.length, start + text.length);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
}

function selectSource(asset: Asset, mobile: boolean) {
  if (mobile) {
    const select = field<HTMLSelectElement>('source-select');
    select.focus(); select.value = asset; select.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const radio = document.querySelector<HTMLInputElement>(`input[name="source"][value="${asset}"]`)!;
    radio.focus(); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function boot(market: Market, mobile = false) {
  vi.resetModules();
  vi.stubEnv('BASE_URL', '/ibit-to-btc/');
  vi.stubGlobal('location', { pathname: `/ibit-to-btc/${market === 'ar' ? 'ar/' : ''}`, assign: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn() })));
  document.head.innerHTML = '<meta name="description" content="">';
  document.body.innerHTML = '<div id="app"></div>';
  requestRates.mockReset(); requestRates.mockResolvedValue(fixture()[market]);
  registerTool.mockReset();
  await import('./main');
  expect(requestRates).toHaveBeenCalledWith(market);
  expect(document.querySelector('[data-result="btc"] output')!.textContent).toBe('0.00000000');
}

let documentListeners: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  documentListeners = vi.spyOn(document, 'addEventListener');
});
afterEach(() => {
  for (const [type, listener, options] of documentListeners.mock.calls) {
    document.removeEventListener(type, listener, options);
  }
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

for (const market of ['ar', 'global'] as const) {
  for (const mobile of [false, true]) {
    describe(`${market}, ${mobile ? 'mobile' : 'desktop'}: section isolation`, () => {
      it('clears only the converter and preserves every average-price draft', async () => {
        await boot(market, mobile);
        const currencies = market === 'ar' ? ['usd', 'ars', 'usd_ccl'] : ['usd'];
        const currency = field<HTMLSelectElement>('cost-currency');
        for (const [index, value] of currencies.entries()) {
          if (currency) { currency.value = value; currency.dispatchEvent(new Event('change')); }
          enter(price(), `${index + 4}${market === 'ar' ? ',' : '.'}37`);
        }
        enter(amount(), '12');
        field<HTMLButtonElement>('clear').click();
        expect(amount().value).toBe('');
        expect(document.activeElement).toBe(amount());
        for (const [index, value] of currencies.entries()) {
          if (currency) { currency.value = value; currency.dispatchEvent(new Event('change')); }
          expect(price().value).toBe(`${index + 4}${market === 'ar' ? ',' : '.'}37`);
          expect(field('cost-per-btc').textContent).not.toBe('—');
        }
      });

      it('does not mutate average-price fields or delay their announcement when converting', async () => {
        await boot(market, mobile);
        enter(price(), market === 'ar' ? '4,37' : '43.68');
        const observer = new MutationObserver(() => {});
        observer.observe(document.querySelector('.average-cost')!, { subtree: true, attributes: true, childList: true, characterData: true });
        vi.advanceTimersByTime(300);
        enter(amount(), '12');
        expect(observer.takeRecords()).toEqual([]);
        observer.disconnect();
        vi.advanceTimersByTime(150);
        expect(field('cost-announcement').textContent).toContain(market === 'ar' ? 'por BTC' : 'per BTC');
      });

      it('keeps each keyboard, separator, cursor and result independent through all source transitions', async () => {
        await boot(market, mobile);
        const costText = market === 'ar' ? '4,37' : '43.68';
        enter(price(), costText);
        const costResult = field('cost-per-btc').textContent;
        const keyboardWrites = vi.spyOn(price(), 'inputMode', 'set');
        const languageWrites = vi.spyOn(price(), 'lang', 'set');
        // Visit every ordered pair, including numeric -> decimal -> numeric.
        for (const first of assetsFor(market)) {
          for (const next of assetsFor(market)) {
            selectSource(first, mobile); enter(amount(), '12');
            selectSource(next, mobile);
            amount().focus(); enter(amount(), '12');
            const rules = getAmountInputRules(next, market);
            expect(amount().inputMode).toBe(rules.separator ? 'decimal' : 'numeric');
            expect(amount().lang).toBe(rules.separator === '.' || market === 'global' ? 'en-US' : 'es-AR');
            type(amount(), rules.separator === '.' ? ',' : '.');
            if (rules.separator) {
              type(amount(), '5');
              expect(amount().value).toBe(`12${rules.separator}5`);
            } else expect(amount().value).toBe('12');
            enter(amount(), '12');
            price().focus(); price().setSelectionRange(1, 2);
            expect(price().inputMode).toBe('decimal');
            expect(price().lang).toBe(market === 'ar' ? 'es-AR' : 'en-US');
            expect(price().value).toBe(costText);
            expect(field('cost-per-btc').textContent).toBe(costResult);
            const converterResult = field('results').innerHTML;
            enter(price(), '5');
            type(price(), market === 'ar' ? '.' : ','); type(price(), '25');
            expect(price().value).toBe(market === 'ar' ? '5,25' : '5.25');
            expect(amount().value).toBe('12');
            expect(field('results').innerHTML).toBe(converterResult);
            enter(price(), costText);
            price().setSelectionRange(1, 2);
            field<HTMLButtonElement>('refresh').click();
            await Promise.resolve();
            expect([price().selectionStart, price().selectionEnd]).toEqual([1, 2]);
            expect(document.activeElement).toBe(price());
          }
        }
        expect(keyboardWrites.mock.calls.length).toBe(0);
        expect(languageWrites.mock.calls.length).toBe(0);
      });

      it('keeps rejected inputs and their feedback confined to the edited section', async () => {
        await boot(market, mobile);
        enter(price(), market === 'ar' ? '4,37' : '43.68'); enter(amount(), '12');
        price().focus(); type(price(), 'x');
        expect(field('cost-format-feedback').hidden).toBe(false);
        expect(field('input-format-feedback').hidden).toBe(true);
        amount().focus(); type(amount(), 'x');
        expect(amount().value).toBe('12');
        expect(field('input-format-feedback').hidden).toBe(false);
        field<HTMLButtonElement>('clear').click();
        expect(field('input-format-feedback').hidden).toBe(true);
        expect(field('cost-format-feedback').hidden).toBe(false);
        expect(price().value).toBe(market === 'ar' ? '4,37' : '43.68');
        type(amount(), 'x');
        field<HTMLButtonElement>('cost-clear').click();
        expect(field('cost-format-feedback').hidden).toBe(true);
        expect(field('input-format-feedback').hidden).toBe(false);
      });

      it('preserves a keyboard composition through edits and an actual rates refresh', async () => {
        await boot(market, mobile);
        enter(price(), '4');
        price().focus(); price().dispatchEvent(new CompositionEvent('compositionstart'));
        price().value = '45'; price().setSelectionRange(2, 2);
        price().dispatchEvent(new InputEvent('input', { isComposing: true }));
        enter(amount(), '12');
        expect(price().value).toBe('45');
        requestRates.mockResolvedValue({ ...fixture()[market], holdingsBtc: '28' });
        field<HTMLButtonElement>('refresh').click(); await Promise.resolve();
        expect(price().value).toBe('45');
        price().dispatchEvent(new CompositionEvent('compositionend'));
        expect(price().value).toBe('45');
        expect(field('cost-per-btc').textContent).toBe(market === 'ar' ? '1.607.142,86' : '160,714.29');
      });

      it('keeps average price intact when using a result or the browser conversion tool', async () => {
        await boot(market, mobile);
        enter(price(), market === 'ar' ? '4,37' : '43.68');
        const before = price().value;
        enter(amount(), '12');
        document.querySelector<HTMLButtonElement>('button[data-source="btc"]')!.click();
        expect(document.activeElement).toBe(amount());
        expect(amount().inputMode).toBe('decimal'); expect(amount().lang).toBe('en-US');
        expect(price().value).toBe(before);
        const execute = registerTool.mock.calls[0][0] as (input: unknown) => unknown;
        execute({ asset: 'usd', amount: market === 'ar' ? '150,00' : '150.00' });
        expect(price().value).toBe(before);
        expect(price().inputMode).toBe('decimal');
        expect(price().lang).toBe(market === 'ar' ? 'es-AR' : 'en-US');
      });

      it('clears only the average-price drafts from its own button', async () => {
        await boot(market, mobile);
        enter(amount(), '12');
        const converterResult = field('results').innerHTML;
        const currency = field<HTMLSelectElement>('cost-currency');
        const currencies = market === 'ar' ? ['ars', 'usd', 'usd_ccl'] : ['usd'];
        for (const value of currencies) {
          if (currency) { currency.value = value; currency.dispatchEvent(new Event('change')); }
          enter(price(), '4');
        }
        field<HTMLButtonElement>('cost-clear').click();
        expect(document.activeElement).toBe(price());
        expect(amount().value).toBe('12');
        expect(field('results').innerHTML).toBe(converterResult);
        vi.advanceTimersByTime(450);
        expect(field('cost-announcement').textContent).toBe('');
        for (const value of currencies) {
          if (currency) { currency.value = value; currency.dispatchEvent(new Event('change')); }
          expect(price().value).toBe('');
          expect(field('cost-per-btc').textContent).toBe('—');
        }
      });

      it('leaves the version selector matching its page before navigation or a history return', async () => {
        await boot(market, mobile);
        const select = field<HTMLSelectElement>('version-select');
        select.value = market === 'ar' ? 'global' : 'ar';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(location.assign).toHaveBeenCalledWith(`/ibit-to-btc/${market === 'ar' ? '' : 'ar/'}`);
        expect(select.value).toBe(market);
      });
    });
  }
}

it('starts a fresh market state after international -> Argentina -> international navigation', async () => {
  for (const market of ['global', 'ar', 'global', 'ar'] as const) {
    await boot(market, true);
    expect(price().value).toBe(''); expect(amount().value).toBe('0');
    expect(field('cost-per-btc').textContent).toBe('—');
    expect([...field<HTMLSelectElement>('source-select').options].map(option => option.value)).toEqual(assetsFor(market));
    expect(price().lang).toBe(market === 'ar' ? 'es-AR' : 'en-US');
    enter(price(), market === 'ar' ? '4,37' : '43.68');
    enter(amount(), '12');
  }
});
