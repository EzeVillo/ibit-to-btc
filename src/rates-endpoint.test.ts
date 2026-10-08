import { describe, expect, it } from 'vitest';
import { ratesEndpoint } from './rates-endpoint';

describe('public gateway endpoint configuration', () => {
  it('uses local snapshot routing when no public gateway is configured', () => {
    expect(ratesEndpoint('', '/ibit-to-btc/')).toBe('/ibit-to-btc/api/rates');
  });
  it.each(['https://user:secret@gateway.test/api/rates', 'https://gateway.test/api/rates?token=secret',
    'https://gateway.test/api/rates#fragment', 'http://gateway.test/api/rates', 'https://gateway.test/update'])('rejects %s', value => {
    expect(() => ratesEndpoint(value, '/')).toThrow();
  });
  it('accepts HTTPS production and loopback development URLs', () => {
    expect(ratesEndpoint('https://gateway.test/ibit-to-btc/api/rates', '/')).toBe('https://gateway.test/ibit-to-btc/api/rates');
    expect(ratesEndpoint('http://127.0.0.1:8787/ibit-to-btc/api/rates', '/')).toContain(':8787/');
  });
});
