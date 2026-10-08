import { describe, expect, it } from 'vitest';
import { mergeSnapshot, validateSnapshot } from './snapshot';
import { fixture } from './test-fixtures';

describe('stored rates snapshots', () => {
  it('retains failed markets and missing quotes with their original dates', () => {
    const old = fixture();
    const updated = { ...old.ar!, fetchedAt: '2026-10-08T17:15:00Z', cedearUsd: null };
    const snapshot = mergeSnapshot(old, updated, null);
    expect(snapshot.ar!.fetchedAt).toBe(updated.fetchedAt);
    expect(snapshot.ar!.cedearUsd).toEqual(old.ar!.cedearUsd);
    expect(snapshot.global).toEqual(old.global);
    const global = mergeSnapshot(old, null, { ...old.global!, ibitUsd: null, quoteStatus: 'unavailable' });
    expect(global.global!.ibitUsd).toEqual(old.global!.ibitUsd);
    expect(global.global!.quoteStatus).toBe('available');
  });
  it('does not invent a market or quote on the first incomplete update', () => {
    const snapshot = mergeSnapshot(null, null, { ...fixture().global!, ibitUsd: null, quoteStatus: 'unavailable' });
    expect(snapshot.ar).toBeNull();
    expect(snapshot.global!.ibitUsd).toBeNull();
  });
  it.each([null, {}, { version: 2, ar: null, global: null }, { version: 1, global: null },
    { ...fixture(), ar: { ...fixture().ar, holdingsBtc: '0' } }])('rejects corrupted snapshots %j', value => {
    expect(() => validateSnapshot(value)).toThrow();
  });
});
