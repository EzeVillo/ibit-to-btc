import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { averageCostMarkup, createAverageCostUI } from './average-cost-ui';
import type { Market } from './market';
import { fixture } from '../shared/test-fixtures';

// Exercise the rendered fields and native events without a browser/DOM dependency.
class TestElement extends EventTarget {
  textContent = '';
  hidden = false;
  value = '';
  placeholder = '';
  inputMode = '';
  lang = '';
  selectionStart = 0;
  selectionEnd = 0;
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
}

function setup(market: Market = 'ar') {
  const elements = new Map([...averageCostMarkup(market).matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new TestElement()]));
  const element = (id: string) => elements.get(id)!;
  if (market === 'ar') element('cost-currency').value = 'usd';
  const root = { querySelector: (selector: string) => elements.get(selector.slice(1)) ?? null } as unknown as HTMLElement;
  const ui = createAverageCostUI(root, market);
  const enter = (raw: string) => {
    const price = element('cost-price');
    price.value = raw;
    price.setSelectionRange(raw.length, raw.length);
    price.dispatchEvent(new Event('input'));
  };
  const selectCurrency = (value: string) => {
    const currency = element('cost-currency');
    currency.value = value;
    currency.dispatchEvent(new Event('change'));
  };
  return { ui, element, enter, selectCurrency };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('independent average-cost fields', () => {
  it.each([
    ['ars', '80', '1.428.571,43', 'ARS', 'ARS'],
    ['usd', '4', '71.428,57', 'USD MEP', 'USD'],
    ['usd_ccl', '4', '71.428,57', 'USD CCL', 'USD'],
  ])('calculates %s per CEDEAR and shows the simplified result currency', (currency, raw, expected, label, resultLabel) => {
    const { ui, element, enter, selectCurrency } = setup();
    ui.update(fixture().ar);
    selectCurrency(currency);
    enter(raw);
    for (let i = 0; i < 10; i++) ui.update(fixture().ar);
    expect(element('cost-price-label').textContent).toBe('Precio promedio por CEDEAR');
    expect(element('cost-price-unit').textContent).toBe(`${label} / CEDEAR`);
    expect(element('cost-price').value).toBe(raw);
    expect(element('cost-currency').value).toBe(currency);
    expect(element('cost-per-btc').textContent).toBe(expected);
    expect(element('cost-result-unit').textContent).toBe(`${resultLabel} por 1 BTC`);
    vi.advanceTimersByTime(450);
    expect(element('cost-announcement').textContent).toContain(`${resultLabel} por BTC`);
  });

  it('restores independent currency drafts, including an empty draft', () => {
    const { ui, element, enter, selectCurrency } = setup();
    ui.update(fixture().ar);
    enter('4,37');
    selectCurrency('ars');
    expect(element('cost-price').value).toBe('');
    expect(element('cost-per-btc').textContent).toBe('—');
    enter('6552');
    selectCurrency('usd_ccl');
    enter('4,20');
    for (const [currency, raw] of [['usd', '4,37'], ['ars', '6552'], ['usd_ccl', '4,20']]) {
      selectCurrency(currency);
      ui.update(fixture().ar);
      expect(element('cost-price').value).toBe(raw);
    }
  });

  it('keeps the entered price while loading or refreshing the fund report, without quotes', () => {
    const { ui, element, enter, selectCurrency } = setup();
    ui.update(null);
    selectCurrency('ars');
    enter('80');
    expect(element('cost-price').value).toBe('80');
    expect(element('cost-per-btc').textContent).toBe('—');
    expect(element('cost-result-note').textContent).toContain('Esperá');
    const rates = { ...fixture().ar!, cedearArs: null, cedearUsd: null, cedearUsdCcl: null };
    ui.update(rates);
    expect(element('cost-per-btc').textContent).toBe('1.428.571,43');
    ui.update({ ...rates, holdingsBtc: '28' });
    expect(element('cost-per-btc').textContent).toBe('2.857.142,86');
    expect(element('cost-price').value).toBe('80');
    expect(element('cost-currency').value).toBe('ars');
  });

  it('preserves unfinished inputs and rejects excess precision without adopting the rejected value', () => {
    const { ui, element, enter, selectCurrency } = setup();
    ui.update(fixture().ar);
    enter(',');
    ui.update(null);
    ui.update(fixture().ar);
    expect(element('cost-price').value).toBe(',');
    expect(element('cost-price-error').hidden).toBe(true);
    enter('4,37');
    enter('4,371');
    expect(element('cost-price').value).toBe('4,37');
    expect(element('cost-format-feedback').textContent).toContain('hasta 2 decimales');
    ui.update(fixture().ar);
    expect(element('cost-format-feedback').hidden).toBe(false);
    selectCurrency('ars');
    selectCurrency('usd');
    expect(element('cost-price').value).toBe('4,37');
    expect(element('cost-per-btc').textContent).toBe('78.035,71');
  });

  it('clears every currency draft and the pending announcement', () => {
    const { ui, element, enter, selectCurrency } = setup();
    ui.update(fixture().ar);
    for (const currency of ['ars', 'usd', 'usd_ccl']) { selectCurrency(currency); enter('4'); }
    ui.clear();
    vi.advanceTimersByTime(450);
    expect(element('cost-announcement').textContent).toBe('');
    for (const currency of ['ars', 'usd', 'usd_ccl']) {
      selectCurrency(currency);
      ui.update(fixture().ar);
      expect(element('cost-price').value).toBe('');
      expect(element('cost-per-btc').textContent).toBe('—');
    }
  });

  it('keeps the international input in USD per IBIT share during loading and refreshes', () => {
    const { ui, element, enter } = setup('global');
    ui.update(null);
    enter('43.68');
    ui.update(fixture().global);
    expect(element('cost-price-label').textContent).toBe('Average price per IBIT share');
    expect(element('cost-price-unit').textContent).toBe('USD / IBIT share');
    expect(element('cost-per-btc').textContent).toBe('78,000.00');
    ui.update({ ...fixture().global!, holdingsBtc: '28', ibitUsd: null, quoteStatus: 'unavailable' });
    expect(element('cost-per-btc').textContent).toBe('156,000.00');
    expect(element('cost-price').value).toBe('43.68');
    expect(element('cost-result-unit').textContent).toBe('USD per 1 BTC');
  });
});
