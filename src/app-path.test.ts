import { describe, expect, it } from 'vitest';
import { appPath, normalizeBasePath, pathWithinApp } from './app-path';
import { marketFromPath } from './market';

describe('configurable application paths', () => {
  it('defaults to the selected project name and accepts root deployments', () => {
    expect(normalizeBasePath()).toBe('/ibit-to-btc/');
    expect(normalizeBasePath('')).toBe('/ibit-to-btc/');
    expect(normalizeBasePath('/')).toBe('/');
    expect(normalizeBasePath('tools/converter')).toBe('/tools/converter/');
  });
  it.each(['https://example.com/app/', '//example.com/', '/a//b/', '/../', '/a/../b/', '/a%2fb/', '/app?x=1', '/app#x', '/app name/', '/.netlify/', '/app\\x/'])('rejects unsafe prefix %s', value => {
    expect(() => normalizeBasePath(value)).toThrow('APP_BASE_PATH');
  });
  it('keeps navigation and API paths inside the application', () => {
    expect(appPath('/ibit-to-btc/', 'ar/')).toBe('/ibit-to-btc/ar/');
    expect(appPath('/tools/converter/', '/api/rates')).toBe('/tools/converter/api/rates');
    expect(appPath('/')).toBe('/');
  });
  it('strips only the complete prefix, including the URL before its slash redirect', () => {
    expect(pathWithinApp('/ibit-to-btc', '/ibit-to-btc/')).toBe('/');
    expect(pathWithinApp('/ibit-to-btc/ar/', '/ibit-to-btc/')).toBe('/ar/');
    expect(pathWithinApp('/ibit-to-btc-other/ar/', '/ibit-to-btc/')).toBeNull();
    expect(pathWithinApp('/ar/', '/ibit-to-btc/')).toBeNull();
  });
  it('detects the Argentine market below the configured prefix', () => {
    expect(marketFromPath('/ibit-to-btc/ar/', '/ibit-to-btc/')).toBe('ar');
    expect(marketFromPath('/tools/converter/ar', '/tools/converter/')).toBe('ar');
    expect(marketFromPath('/ibit-to-btc/', '/ibit-to-btc/')).toBe('global');
    expect(marketFromPath('/ibit-to-btc/arbitrary', '/ibit-to-btc/')).toBe('global');
    expect(marketFromPath('/ar/', '/ibit-to-btc/')).toBe('global');
  });
});
