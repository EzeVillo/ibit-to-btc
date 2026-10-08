import { AverageCostModel, costFormatHint, formatCost, getCostInputRules, getCostUnit } from './average-cost';
import type { Asset, CurrencyAsset } from './conversion';
import type { AnyRates } from './rates';
import { bindNumericInput } from './numeric-input';
import { createTransientFeedback } from './transient-feedback';
import { localeFor } from './market';
import type { Market } from './market';
import { translator } from './i18n';

export function averageCostMarkup(market: Market): string {
  const t = translator(market);
  const unit = market === 'ar' ? 'CEDEAR' : t('ibitUnit');
  return `<section class="average-cost" aria-labelledby="average-cost-title">
    <div class="average-cost-heading"><h2 id="average-cost-title">${t('costTitle')}</h2><p>${t('costIntro')}</p></div>
    <div id="average-cost-workspace" class="average-cost-workspace">
      <div id="average-cost-fields" class="average-cost-input">
        ${market === 'ar' ? `<div class="cost-field"><label for="cost-currency">${t('costCurrency')}</label><select id="cost-currency"><option value="ars">ARS</option><option value="usd" selected>${t('mepCurrency')}</option><option value="usd_ccl">${t('cclCurrency')}</option></select></div>` : ''}
        <div class="cost-field"><label id="cost-price-label" for="cost-price">${t('costPrice', { unit })}</label><input id="cost-price" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-describedby="cost-price-unit cost-price-help cost-price-error cost-format-feedback cost-adjustment" /><span id="cost-price-unit" class="cost-unit">${market === 'ar' ? 'USD MEP' : 'USD'} / ${unit}</span></div>
        <p id="cost-price-error" class="input-error" role="alert" hidden></p><p id="cost-format-feedback" class="input-format-feedback" role="status" hidden></p><p id="cost-adjustment" class="cost-help" hidden></p>
        <p id="cost-price-help" class="cost-help">${costFormatHint(market)}</p><p class="cost-help">${t(market === 'ar' ? 'costHelpAr' : 'costHelpGlobal')}</p>
      </div>
      <section id="average-cost-result" class="average-cost-result" aria-labelledby="cost-result-title">
        <h3 id="cost-result-title">${t('costPerBtc')}</h3><div class="average-cost-value"><span id="cost-approximation" class="approximation" aria-label="${t('approximately')}" hidden>≈</span><output id="cost-per-btc">—</output></div>
        <p id="cost-result-unit" class="cost-result-unit">${t('costResultUnit', { currency: 'USD' })}</p><p id="cost-result-note" class="cost-help">${t('costEnter')}</p>
        <div id="cost-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
      </section>
    </div>
  </section>`;
}

export function createAverageCostUI(root: HTMLElement, market: Market = 'ar') {
  const t = translator(market);
  const model = new AverageCostModel(market);
  const unitLabels = { cedear: 'CEDEAR', ibit: t('ibitUnit'), btc: 'BTC' };
  const currencyLabels: Record<CurrencyAsset, string> = { ars: 'ARS', usd: market === 'ar' ? 'USD MEP' : 'USD', usd_ccl: 'USD CCL' };
  const price = root.querySelector<HTMLInputElement>('#cost-price')!;
  const currency = root.querySelector<HTMLSelectElement>('#cost-currency');
  const feedback = createTransientFeedback(root.querySelector<HTMLElement>('#cost-format-feedback')!);
  let rates: AnyRates | null = null;
  let announcementTimer: ReturnType<typeof setTimeout> | undefined;
  const text = (selector: string, value: string) => { root.querySelector<HTMLElement>(selector)!.textContent = value; };

  function render() {
    const costUnit = getCostUnit(model.source, market);
    const unit = unitLabels[costUnit];
    const label = currencyLabels[model.currency];
    const resultLabel = model.currency === 'ars' ? 'ARS' : 'USD';
    const view = model.view(rates);
    if (currency) currency.value = model.currency;
    if (price.value !== view.input) price.value = view.input;
    priceGuard.sync();
    const example = costUnit === 'btc' ? '78000' : costUnit === 'ibit' ? (market === 'ar' ? '43,68' : '43.68') : model.currency === 'ars' ? '6552' : '4,37';
    price.placeholder = t('costExample', { value: example });
    price.setAttribute('aria-invalid', String(Boolean(view.error)));
    text('#cost-price-label', t('costPrice', { unit }));
    text('#cost-price-unit', `${label} / ${unit}`);
    const error = root.querySelector<HTMLElement>('#cost-price-error')!;
    error.hidden = !view.error; error.textContent = view.error;
    const adjustment = root.querySelector<HTMLElement>('#cost-adjustment')!;
    adjustment.hidden = !view.inputApproximate; adjustment.textContent = t('costAdjustment');
    const formatted = view.equivalents ? formatCost(view.equivalents.btc, market) : null;
    text('#cost-per-btc', formatted?.text ?? '—');
    root.querySelector<HTMLElement>('#cost-approximation')!.hidden = !formatted?.approximate || formatted.text.startsWith('<');
    text('#cost-result-unit', t('costResultUnit', { currency: resultLabel }));
    const date = rates ? new Intl.DateTimeFormat(localeFor(market), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${rates.asOf}T12:00:00Z`)) : '';
    text('#cost-result-note', view.error ? t('costCorrect') : !view.hasPrice ? t('costEnter') : !rates ? t('costWait') : t('costCalculated', { date }));
    clearTimeout(announcementTimer);
    if (view.hasPrice || view.error) announcementTimer = setTimeout(() => {
      text('#cost-announcement', formatted ? t('costAnnouncement', { approximation: formatted.approximate ? `${t('approximately')} ` : '', value: formatted.text, currency: resultLabel }) : view.error || t('costAnnouncementEmpty'));
    }, 450);
    else text('#cost-announcement', '');
  }

  if (currency) currency.addEventListener('change', () => { model.currency = currency.value as CurrencyAsset; feedback.hide(); render(); });
  const priceGuard = bindNumericInput(price, { rules: () => getCostInputRules(market), onAccept: () => { model.setPrice(price.value); feedback.hide(); render(); }, onReject: feedback.show });
  return {
    update(source: Asset, newRates: AnyRates | null) { if (source !== model.source) feedback.hide(); model.setSource(source); rates = newRates; render(); },
    clear() { model.clear(); feedback.hide(); render(); },
  };
}
