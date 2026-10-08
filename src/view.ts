import { translator } from './i18n.ts';
import type { Market } from './market.ts';
import type { Asset } from './conversion.ts';
import { GLOBAL_SOURCES, SOURCES } from './rates.ts';

export function html(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function assetInfo(market: Market): Record<Asset, { label: string; subtitle: string; inputLabel: string; unit: string }> {
  const t = translator(market);
  return {
    cedear: { label: 'CEDEAR', subtitle: t('cedearSubtitle'), inputLabel: t('cedearInput'), unit: 'CEDEAR' },
    ibit: { label: 'IBIT', subtitle: t('ibitSubtitle'), inputLabel: t('ibitInput'), unit: 'IBIT' },
    btc: { label: 'BTC', subtitle: 'Bitcoin', inputLabel: t('btcInput'), unit: 'BTC' },
    sats: { label: 'Satoshis', subtitle: t('satsSubtitle'), inputLabel: t('satsInput'), unit: 'sats' },
    usd: { label: market === 'ar' ? 'USD MEP' : 'USD', subtitle: market === 'ar' ? 'IBITD' : t('usdSubtitle'), inputLabel: t(market === 'ar' ? 'mepInput' : 'usdInput'), unit: market === 'ar' ? 'USD MEP' : 'USD' },
    usd_ccl: { label: 'USD CCL', subtitle: 'IBITC', inputLabel: t('cclInput'), unit: 'USD CCL' },
    ars: { label: 'ARS', subtitle: 'IBIT', inputLabel: t('arsInput'), unit: 'ARS' },
  };
}

export function methodologyMarkup(market: Market): string {
  const t = translator(market);
  return `<div class="methodology-content">
    ${market === 'ar' ? `<div class="method-item"><h2>${t('cedearMethodTitle')}</h2><p id="cedear-method">${t('cedearMethod')}</p><a href="${SOURCES.cedear}" target="_blank" rel="noopener noreferrer">${t('comafiLink')}</a></div>` : ''}
    <div class="method-item"><h2>${t('btcMethodTitle')}</h2><p id="btc-method">${t('btcMethod')}</p><p>${t('fundTrading')}</p><p>${t('fundFees')}${market === 'ar' ? ` ${t('cedearFees')}` : ''}</p><a href="${SOURCES.fund}" target="_blank" rel="noopener noreferrer">${t('isharesLink')}</a></div>
    <div class="method-item"><h2>${t('satsMethodTitle')}</h2><p>${t('satsMethod')}</p></div>
    <div class="method-item"><h2>${t(market === 'ar' ? 'moneyMethodTitleAr' : 'moneyMethodTitleGlobal')}</h2><p id="money-method">${t(market === 'ar' ? 'moneyMethodAr' : 'moneyMethodGlobal')}</p><p class="market-detail" id="market-detail">${t('marketLoading')}</p><a href="${market === 'ar' ? 'https://data912.com/' : GLOBAL_SOURCES.quotes}" target="_blank" rel="noopener noreferrer">${t('providerLink')}</a></div>
    <div class="method-item"><h2>${t('costTitle')}</h2><p>${t(market === 'ar' ? 'costMethodAr' : 'costMethodGlobal')}</p><p>${t(market === 'ar' ? 'costFeesAr' : 'costFeesGlobal')}</p><p>${t('costHistory')}${market === 'ar' ? ` ${t('costIndependent')}` : ''}</p><p>${t(market === 'ar' ? 'costReferenceAr' : 'costReferenceGlobal')}</p></div>
    <p class="method-disclaimer">${t('disclaimer')}</p>
  </div>`;
}
