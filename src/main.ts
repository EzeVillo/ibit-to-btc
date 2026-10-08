import '@fontsource-variable/sora';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './style.css';
import Decimal from 'decimal.js';
import { assetsFor, convert, currenciesFor, formatAmount, getAmountInputRules, getCurrencyQuote, getMaxAmount, getWholeUnitRounding, inputAmount, inputDecimalPlaces, inputFormatHint, isCurrencyAsset, parseAmount } from './conversion';
import type { Amounts, Asset } from './conversion';
import { isGlobalRates } from './rates';
import type { AnyRates } from './rates';
import { requestRates, RatesLoadError } from './rates-client';
import { ratesFailureMessage, ratesWarnings, sourceQuoteWarning } from './rates-feedback';
import { registerConversionTool } from './webmcp';
import { averageCostMarkup, createAverageCostUI } from './average-cost-ui';
import { bindNumericInput } from './numeric-input';
import { createTransientFeedback } from './transient-feedback';
import { localeFor, marketFromPath } from './market';
import { translator } from './i18n';
import { assetInfo, html, methodologyMarkup } from './view';
import { appPath, normalizeBasePath } from './app-path';

const basePath = normalizeBasePath(import.meta.env.BASE_URL);
const market = marketFromPath(location.pathname, basePath);
const t = translator(market);
const assets = assetsFor(market);
const currencyAssets = currenciesFor(market);
const defaultSource: Asset = market === 'ar' ? 'cedear' : 'ibit';
const info = assetInfo(market);
const format = (amount: Decimal, asset: Asset) => formatAmount(amount, asset, market);
document.documentElement.lang = market === 'ar' ? 'es-AR' : 'en';
document.title = t(market === 'ar' ? 'pageTitleAr' : 'pageTitleGlobal');
document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = t(market === 'ar' ? 'pageDescriptionAr' : 'pageDescriptionGlobal');

const icons = {
  exchange: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  cedear: '<path d="M4 9h16M6 9v10m4-10v10m4-10v10m4-10v10M3 20h18M12 3 3 8h18L12 3Z"/>',
  ibit: '<path d="M5 20V10m7 10V4m7 16v-7"/><path d="M3 20h18"/>',
  btc: '<path d="M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3.5 3.5 0 0 1 0 7H9m1-13v13M10 3v2m4-2v2m-4 13v3m4-3v3M7 5h3M7 18h3"/>',
  sats: '<path d="M7 6h10M5 10h14M5 14h14M7 18h10"/>',
  usd: '<path d="M16 6c-1-2-8-2-8 2s8 3 8 7-7 4-9 1M12 3v18"/>',
  usd_ccl: '<path d="M16 6c-1-2-8-2-8 2s8 3 8 7-7 4-9 1M12 3v18"/>',
  ars: '<path d="M16 6c-1-2-8-2-8 2s8 3 8 7-7 4-9 1M12 3v18"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
function icon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.dataset.market = market;
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="${appPath(basePath, market === 'ar' ? 'ar/' : '')}" aria-label="${t('home')}"><span class="brand-mark">${icon('exchange')}</span><span>IBIT<span class="brand-to"> to </span>BTC</span></a>
    <div class="header-actions">
      <label class="version-picker" for="version-select"><span class="sr-only">${t('version')}</span><select id="version-select"><option value="global" ${market === 'global' ? 'selected' : ''}>${t('versionGlobal')}</option><option value="ar" ${market === 'ar' ? 'selected' : ''}>${t('versionAr')}</option></select></label>
      <label class="theme-picker" for="theme-select"><span class="theme-label">${t('theme')}</span><select id="theme-select" aria-label="${t('themeLabel')}"><option value="system">${t('system')}</option><option value="light">${t('light')}</option><option value="dark">${t('dark')}</option></select></label>
    </div>
  </header>
  <main id="main" class="main">
    <section class="intro" aria-labelledby="page-title"><span class="eyebrow">${t('eyebrow')}</span><h1 id="page-title">${t('title')}</h1><p>${t('intro')}</p></section>
    <section class="converter" aria-label="${t(market === 'ar' ? 'converterAr' : 'converterGlobal')}">
      <fieldset class="source-picker"><legend id="source-picker-label">${t('convertFrom')}</legend>
        <div class="source-select-wrap"><select id="source-select" aria-labelledby="source-picker-label">${assets.map(asset => `<option value="${asset}" ${asset === defaultSource ? 'selected' : ''}>${info[asset].label} · ${info[asset].subtitle}</option>`).join('')}</select></div>
        <div class="source-options">${assets.map(asset => `<label class="source-option" data-asset="${asset}"><input type="radio" name="source" value="${asset}" ${asset === defaultSource ? 'checked' : ''} /><span class="option-icon">${icon(asset)}</span><span class="option-copy"><span class="option-name">${info[asset].label}</span><span class="option-subtitle">${info[asset].subtitle}</span></span><span class="selected-dot" aria-hidden="true"></span></label>`).join('')}</div>
      </fieldset>
      <div class="conversion-workspace">
        <div class="input-panel">
          <div class="panel-heading"><span id="quantity-heading" class="section-label">${t('quantity')}</span><button id="clear" class="text-button" type="button">${t('clear')}</button></div>
          <label id="amount-label" for="amount">${info[defaultSource].inputLabel}</label>
          <div class="amount-wrap"><input id="amount" type="text" inputmode="numeric" value="0" autocomplete="off" spellcheck="false" aria-describedby="input-help input-error input-format-feedback source-warning" /><span id="input-unit">${info[defaultSource].unit}</span></div>
          <p id="input-error" class="input-error" role="alert" hidden></p><p id="input-help" class="input-help">${inputFormatHint(defaultSource, market)}</p><p id="input-format-feedback" class="input-format-feedback" role="status" hidden></p>
          <p id="source-warning" class="input-source-warning" role="status" hidden></p>
          <div class="source-explanation"><span class="explanation-icon">${icon('exchange')}</span><p id="source-explanation"></p></div>
        </div>
        <div class="results-panel" aria-busy="true">
          <div class="panel-heading"><span id="equivalences-heading" class="section-label">${t('equivalences')}</span><span class="result-caption">${t('automatic')}</span></div>
          <div id="results" class="results-grid"></div><div id="rounding-notice" class="rounding-notice" hidden></div>
          <p class="currency-note">${t(market === 'ar' ? 'currencyNoteAr' : 'currencyNoteGlobal')}</p><p id="result-note" class="result-note">${t('sourceData')}</p>
        </div>
      </div>
      <div class="data-bar"><span id="data-status" class="data-status">${t('loading')}</span><button id="refresh" class="refresh-button" type="button" aria-label="${t('refreshLabel')}">${icon('refresh')}<span>${t('refresh')}</span></button></div>
    </section>
    <p id="data-warning" class="data-warning" role="status" hidden></p>
    ${averageCostMarkup(market)}
    <details class="methodology"><summary><span>${t('methodTitle')}</span>${icon('chevron')}</summary>${methodologyMarkup(market)}</details>
    <footer class="footer"><span>${icon('lock')}${t('privacy')}</span><span>IBIT to BTC</span></footer>
    <div id="announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  </main>`;

const amountInput = document.querySelector<HTMLInputElement>('#amount')!;
const sourceSelect = document.querySelector<HTMLSelectElement>('#source-select')!;
const resultsEl = document.querySelector<HTMLDivElement>('#results')!;
const mobileLayout = window.matchMedia('(max-width: 700px)');
const sourceExplanationEl = document.querySelector<HTMLDivElement>('.source-explanation')!;
const errorEl = document.querySelector<HTMLParagraphElement>('#input-error')!;
const statusEl = document.querySelector<HTMLSpanElement>('#data-status')!;
const warningEl = document.querySelector<HTMLParagraphElement>('#data-warning')!;
const sourceWarningEl = document.querySelector<HTMLParagraphElement>('#source-warning')!;
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh')!;
const roundingNoticeEl = document.querySelector<HTMLDivElement>('#rounding-notice')!;
const inputHelpEl = document.querySelector<HTMLParagraphElement>('#input-help')!;
const formatFeedback = createTransientFeedback(document.querySelector<HTMLParagraphElement>('#input-format-feedback')!);
let source: Asset = defaultSource;
let rates: AnyRates | null = null;
let exactAmount: Decimal | null = new Decimal(0);
let amounts: Amounts | null = null;
let validationError = '';
let loading = false;
let lastRefresh = 0;
let loadError: RatesLoadError | null = null;
let announcementTimer: ReturnType<typeof setTimeout> | undefined;
let sourceChangeAdjustment: { asset: 'cedear' | 'ibit' | 'btc' | 'sats'; from: Decimal; to: Decimal } | null = null;
const averageCost = createAverageCostUI(app, market);

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat(localeFor(market), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
function text(selector: string, value: string) { document.querySelector<HTMLElement>(selector)!.textContent = value; }

function render(): void {
  text('#quantity-heading', t(isCurrencyAsset(source) ? 'moneyAmount' : 'quantity'));
  text('#equivalences-heading', t(isCurrencyAsset(source) ? 'moneyEquivalences' : 'equivalences'));
  text('#amount-label', info[source].inputLabel); text('#input-unit', info[source].unit);
  inputHelpEl.textContent = inputFormatHint(source, market);
  amountInput.classList.toggle('long-amount', amountInput.value.length > 12);
  document.querySelectorAll<HTMLInputElement>('input[name="source"]').forEach(input => { input.checked = input.value === source; });
  sourceSelect.value = source;
  errorEl.hidden = !validationError; errorEl.textContent = validationError;
  amountInput.setAttribute('aria-invalid', String(Boolean(validationError)));
  const sourceAvailable = rates && (!isCurrencyAsset(source) || getCurrencyQuote(rates, source));
  const sourceWarning = sourceQuoteWarning(rates, source, market);
  sourceWarningEl.textContent = sourceWarning; sourceWarningEl.hidden = !sourceWarning;
  const warnings = ratesWarnings(rates, market, loadError);
  warningEl.textContent = warnings.join(' '); warningEl.hidden = warnings.length === 0;
  amounts = exactAmount !== null && rates && sourceAvailable && !validationError ? convert(exactAmount, source, rates) : null;
  roundingNoticeEl.hidden = true; roundingNoticeEl.textContent = '';
  if (isCurrencyAsset(source) && amounts && exactAmount && rates) {
    const rounding = getWholeUnitRounding(exactAmount, source, rates);
    if (rounding.direction !== 'exact') {
      const units = format(rounding.units, rounding.unit).text;
      const title = t('roundingUnits', { units, asset: info[rounding.unit].label, whole: t(rounding.units.eq(1) ? 'wholeOne' : 'wholeMany') });
      const difference = t(rounding.difference.gt(0) ? 'needed' : 'leftover', { currency: info[source].unit, value: format(rounding.difference.abs(), source).text });
      const value = t('roundingValue', { currency: info[source].unit, value: format(rounding.total, source).text, difference });
      roundingNoticeEl.classList.toggle('rounding-up', rounding.direction === 'up');
      roundingNoticeEl.innerHTML = `<strong>${html(title)}</strong><p>${html(value)}</p>`;
      roundingNoticeEl.hidden = false;
    }
  } else if (sourceChangeAdjustment && amounts) {
    const adjustment = sourceChangeAdjustment;
    roundingNoticeEl.classList.toggle('rounding-up', adjustment.to.gt(adjustment.from));
    if (adjustment.asset === 'btc' || adjustment.asset === 'sats') {
      const title = t(adjustment.asset === 'btc' ? 'roundBtc' : 'roundSats', { value: format(adjustment.to, adjustment.asset).text });
      roundingNoticeEl.innerHTML = `<strong>${html(title)}</strong><p>${t(adjustment.asset === 'btc' ? 'roundBtcHelp' : 'roundSatsHelp')}</p>`;
    } else {
      const from = format(adjustment.from, adjustment.asset);
      const before = t('previousEquivalent', { value: `${from.approximate && !from.text.startsWith('<') ? '≈ ' : ''}${from.text}`, asset: info[adjustment.asset].label });
      const title = t('roundWhole', { asset: info[adjustment.asset].label, units: format(adjustment.to, adjustment.asset).text });
      roundingNoticeEl.innerHTML = `<p class="rounding-equivalent">${html(before)}</p><strong>${html(title)}</strong><p>${t('roundWholeHelp')}</p>`;
    }
    roundingNoticeEl.hidden = false;
  }
  resultsEl.innerHTML = assets.filter(asset => asset !== source).map(asset => {
    const value = amounts?.[asset];
    const formatted = value ? format(value, asset) : null;
    const quoteMissing = rates && isCurrencyAsset(asset) && !getCurrencyQuote(rates, asset);
    return `<article data-result="${asset}" class="result-card ${asset === 'btc' ? 'result-btc' : ''}">
      <div class="result-header"><span class="result-name">${icon(asset)}${info[asset].label}</span><button type="button" class="use-source" data-source="${asset}" aria-label="${t('convertAsset', { asset: info[asset].label })}" ${!value ? 'disabled' : ''}>${t('useSource')}</button></div>
      <div class="result-value"><span class="approximation" aria-label="${formatted?.approximate ? t('approximately') : ''}">${formatted?.approximate && !formatted.text.startsWith('<') ? '≈' : ''}</span><output>${html(formatted?.text ?? '—')}</output></div>
      <span class="result-description">${info[asset].subtitle}${quoteMissing ? ` · ${t('noQuote')}` : ''}</span></article>`;
  }).join('');
  const ratio = rates && !isGlobalRates(rates) ? rates.cedearRatio.split(':') : null;
  const explanations: Record<Asset, string> = {
    cedear: ratio ? t('cedearRatioExplanation', { cedears: ratio[0], shares: ratio[1] }) : t('cedearExplanation'),
    ibit: t('ibitExplanation'), btc: t(market === 'ar' ? 'btcExplanationAr' : 'btcExplanationGlobal'),
    sats: t(market === 'ar' ? 'satsExplanationAr' : 'satsExplanationGlobal'),
    usd: t(market === 'ar' ? 'mepExplanation' : 'usdExplanation'), usd_ccl: t('cclExplanation'), ars: t('arsExplanation'),
  };
  text('#source-explanation', explanations[source]);
  const wholeAsset = market === 'ar' ? amounts?.cedear : amounts?.ibit;
  text('#result-note', sourceWarning ? t('sourceQuoteWait', { currency: info[source].label }) : !amounts ? t('emptyResults') : wholeAsset && !wholeAsset.isInteger() ? t(market === 'ar' ? 'fractionalCedear' : 'fractionalIbit') : t('reference'));
  document.querySelector<HTMLDivElement>('.results-panel')!.setAttribute('aria-busy', String(loading));
  for (const asset of currencyAssets) {
    const unavailable = !rates || !getCurrencyQuote(rates, asset);
    document.querySelector<HTMLInputElement>(`input[name="source"][value="${asset}"]`)!.disabled = unavailable;
    sourceSelect.querySelector<HTMLOptionElement>(`option[value="${asset}"]`)!.disabled = unavailable;
  }
  amountGuard.sync(); clearTimeout(announcementTimer);
  if (amounts) announcementTimer = setTimeout(() => {
    text('#announcement', assets.filter(asset => asset !== source).map(asset => amounts?.[asset] ? `${format(amounts[asset]!, asset).text} ${info[asset].label}` : t('notAvailable', { asset: info[asset].label })).join(', ') + (roundingNoticeEl.hidden ? '' : `. ${roundingNoticeEl.textContent}`));
  }, 450);
  else text('#announcement', '');
}

function placeSourceExplanation(): void {
  document.querySelector<HTMLDivElement>(mobileLayout.matches ? '.results-panel' : '.input-panel')!.append(sourceExplanationEl);
}
function changeSource(next: Asset, focus = false): void {
  if (next === source || !assets.includes(next)) return;
  const converted = amounts?.[next]; sourceChangeAdjustment = null; validationError = ''; formatFeedback.hide();
  if (converted && converted.lte(getMaxAmount(next))) {
    exactAmount = converted.toDecimalPlaces(inputDecimalPlaces(next, market), Decimal.ROUND_HALF_UP);
    if ((next === 'cedear' || next === 'btc' || next === 'sats' || (next === 'ibit' && market === 'global')) && !exactAmount.eq(converted)) sourceChangeAdjustment = { asset: next, from: converted, to: exactAmount };
    amountInput.value = inputAmount(exactAmount, next, market);
  } else {
    exactAmount = null; amountInput.value = '';
    if (converted && (next === 'btc' || next === 'sats')) validationError = t(next === 'btc' ? 'exceedsBtc' : 'exceedsSats');
  }
  source = next; render(); if (focus) amountInput.focus();
}
function updateAmount(): void {
  sourceChangeAdjustment = null; formatFeedback.hide();
  try { exactAmount = amountInput.value === getAmountInputRules(source, market).separator ? null : parseAmount(amountInput.value, source, market); validationError = ''; }
  catch (error) { exactAmount = null; validationError = (error as Error).message; }
  render();
}
const amountGuard = bindNumericInput(amountInput, { rules: () => getAmountInputRules(source, market), onAccept: updateAmount, onReject: formatFeedback.show, replaceInitialZero: true });
amountInput.addEventListener('focus', () => { if (!sourceChangeAdjustment && /^(?:0+(?:[.,]0*)?|[.,]0+)$/.test(amountInput.value.trim())) { amountInput.value = ''; updateAmount(); } });
sourceSelect.addEventListener('change', () => changeSource(sourceSelect.value as Asset));
mobileLayout.addEventListener('change', placeSourceExplanation);
document.querySelectorAll<HTMLInputElement>('input[name="source"]').forEach(input => { input.addEventListener('change', () => changeSource(input.value as Asset)); });
resultsEl.addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-source]'); if (button && !button.disabled) changeSource(button.dataset.source as Asset, true); });
document.querySelector<HTMLButtonElement>('#clear')!.addEventListener('click', () => { amountInput.value = ''; exactAmount = null; validationError = ''; sourceChangeAdjustment = null; formatFeedback.hide(); render(); amountInput.focus(); });
document.querySelector<HTMLSelectElement>('#version-select')!.addEventListener('change', event => {
  const select = event.target as HTMLSelectElement;
  const version = select.value;
  // A history return can restore this document, including the select's current value.
  select.value = market;
  location.assign(appPath(basePath, version === 'ar' ? 'ar/' : ''));
});

async function loadRates(): Promise<void> {
  if (loading) return;
  loading = true; refreshButton.disabled = true; statusEl.textContent = t('loading'); statusEl.classList.add('loading'); render();
  try {
    rates = await requestRates(market);
    averageCost.update(rates);
    loadError = null;
    lastRefresh = Date.now();
    if (isGlobalRates(rates)) {
      statusEl.textContent = t('statusGlobal', { date: dateLabel(rates.asOf) });
      const quoteDate = rates.ibitUsd ? new Intl.DateTimeFormat(localeFor(market), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(rates.ibitUsd.quotedAt)) + ' UTC' : '';
      text('#market-detail', rates.ibitUsd ? t('globalQuoteDetail', { price: format(new Decimal(rates.ibitUsd.price), 'usd').text, date: quoteDate }) : t('globalQuoteUnavailable'));
    } else {
      statusEl.textContent = t('statusAr', { ratio: rates.cedearRatio, date: dateLabel(rates.asOf) });
      const ratio = rates.cedearRatio.split(':'); text('#cedear-method', t('cedearMethodLoaded', { cedears: ratio[0], shares: ratio[1] }));
      text('#market-detail', [rates.cedearUsd ? `IBITD (MEP): USD ${format(new Decimal(rates.cedearUsd.price), 'usd').text}.` : t('notAvailable', { asset: 'IBITD (MEP)' }), rates.cedearUsdCcl ? `IBITC (CCL): USD ${format(new Decimal(rates.cedearUsdCcl.price), 'usd_ccl').text}.` : t('notAvailable', { asset: 'IBITC (CCL)' }), rates.cedearArs ? t('data912Detail', { price: format(new Decimal(rates.cedearArs.price), 'ars').text }) : t('notAvailable', { asset: 'CEDEAR' })].join(' '));
    }
    text('#btc-method', t('btcMethodLoaded', { btc: format(new Decimal(rates.holdingsBtc).div(rates.sharesOutstanding), 'btc').text, date: dateLabel(rates.asOf) }));
  } catch (error) {
    loadError = error instanceof RatesLoadError ? error : new RatesLoadError('backend');
    statusEl.textContent = rates ? t('refreshFailed', { date: dateLabel(rates.asOf) }) : ratesFailureMessage(loadError, market);
  } finally { loading = false; refreshButton.disabled = false; statusEl.classList.remove('loading'); render(); }
}
refreshButton.addEventListener('click', () => { void loadRates(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRefresh > 15 * 60 * 1000) void loadRates(); });
setInterval(() => { if (!document.hidden) void loadRates(); }, 15 * 60 * 1000);
placeSourceExplanation(); render(); void loadRates();

registerConversionTool(input => {
  if (!input || typeof input !== 'object' || !('asset' in input) || !('amount' in input) || !assets.includes(input.asset as Asset) || typeof input.amount !== 'string') throw new Error(t('toolInvalid'));
  const next = input.asset as Asset;
  const parsed = parseAmount(input.amount, next, market);
  if (!parsed || !rates) throw new Error(t('toolWait'));
  const converted = convert(parsed, next, rates);
  const rounding = isCurrencyAsset(next) ? getWholeUnitRounding(parsed, next, rates) : null;
  source = next; exactAmount = parsed; validationError = ''; sourceChangeAdjustment = null; formatFeedback.hide(); amountInput.value = inputAmount(parsed, next, market); render();
  return { market, origin: source, amount: parsed.toFixed(), equivalents: Object.fromEntries(assets.filter(asset => asset !== source).map(asset => [asset, converted[asset]?.toFixed() ?? null])), btcDataAsOf: rates.asOf,
    currencyReference: t(market === 'ar' ? 'toolCurrencyAr' : 'toolCurrencyGlobal'),
    rounding: rounding ? { unit: rounding.unit, theoreticalUnits: rounding.theoreticalUnits.toFixed(), unitsUsed: rounding.units.toFixed(), ...(market === 'ar' ? { theoreticalCedears: rounding.theoreticalUnits.toFixed(), cedearsUsed: rounding.units.toFixed() } : {}), valueUsed: rounding.total.toFixed(), difference: rounding.difference.toFixed(), direction: rounding.direction } : null };
}, market);
