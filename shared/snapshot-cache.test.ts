import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapshotCache } from './snapshot-cache';
import { SNAPSHOT_CACHE_MS, RETRY_MS } from './snapshot';
import { fixture } from './test-fixtures';

afterEach(() => vi.useRealTimers());

describe('global snapshot request coordination', () => {
  it('100 simultaneous cold requests perform exactly one storage read', async () => {
    let complete!: (value: unknown) => void;
    const read = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const persist = vi.fn().mockResolvedValue(undefined);
    const cache = new SnapshotCache(read, persist);
    const requests = Array.from({ length: 100 }, () => cache.get());
    expect(read).toHaveBeenCalledTimes(1);
    complete(fixture());
    const snapshots = await Promise.all(requests);
    expect(snapshots.every(snapshot => snapshot.ar?.cedearRatio === '10:1')).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    await cache.get();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('100 expired requests share one new read, not one read per request or market', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(fixture());
    const cache = new SnapshotCache(read);
    await cache.get();
    vi.advanceTimersByTime(SNAPSHOT_CACHE_MS);
    await Promise.all(Array.from({ length: 100 }, () => cache.get()));
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('100 failures are coalesced and further calls are held back until the retry window', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValue(new Error('Private KV failure'));
    const cache = new SnapshotCache(read);
    const responses = await Promise.allSettled(Array.from({ length: 100 }, () => cache.get()));
    expect(responses.every(response => response.status === 'rejected')).toBe(true);
    await expect(cache.get()).rejects.toThrow('Stored rates unavailable.');
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RETRY_MS);
    read.mockResolvedValue(fixture());
    await expect(cache.get()).resolves.toEqual(fixture());
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('retains valid data during a storage outage, without erasing source timestamps', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(fixture()).mockRejectedValue(new Error('KV quota'));
    const cache = new SnapshotCache(read);
    await cache.get();
    vi.advanceTimersByTime(SNAPSHOT_CACHE_MS);
    const snapshots = await Promise.all(Array.from({ length: 100 }, () => cache.get()));
    expect(snapshots[0]).toEqual(fixture());
    await cache.get();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('restores persistent cache and cooldown after the Durable Object is restarted', async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(undefined);
    const firstRead = vi.fn().mockResolvedValue(fixture());
    const first = new SnapshotCache(firstRead, persist);
    await first.get();
    const nextRead = vi.fn().mockRejectedValue(new Error('KV unavailable'));
    const next = new SnapshotCache(nextRead, persist);
    next.restore(persist.mock.calls[0][0]);
    await next.get();
    expect(nextRead).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SNAPSHOT_CACHE_MS);
    await next.get();
    const restarted = new SnapshotCache(nextRead);
    restarted.restore(persist.mock.calls[1][0]);
    await restarted.get();
    expect(nextRead).toHaveBeenCalledTimes(1);
  });
  it('invalid or empty storage contents do not turn into a new read per visitor', async () => {
    const read = vi.fn().mockResolvedValue({ version: 1, ar: null, global: null });
    const cache = new SnapshotCache(read);
    await Promise.allSettled(Array.from({ length: 100 }, () => cache.get()));
    expect(read).toHaveBeenCalledTimes(1);
  });
});
