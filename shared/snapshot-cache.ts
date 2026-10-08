import { RETRY_MS, SNAPSHOT_CACHE_MS, validateSnapshot } from './snapshot.ts';
import type { RatesSnapshot } from './snapshot.ts';

export interface CacheRecord {
  snapshot: RatesSnapshot | null;
  expiresAt: number;
  retryAt: number;
}

/** One instance in one named Durable Object coordinates all regions and both markets. */
export class SnapshotCache {
  private record: CacheRecord = { snapshot: null, expiresAt: 0, retryAt: 0 };
  private pending: Promise<RatesSnapshot> | null = null;

  constructor(private readonly load: () => Promise<unknown>,
    private readonly persist: (record: CacheRecord) => Promise<void> = async () => {},
    private readonly now: () => number = Date.now) {}

  restore(record: CacheRecord | undefined): void {
    if (!record || !Number.isFinite(record.expiresAt) || !Number.isFinite(record.retryAt)) return;
    this.record = { ...record, snapshot: record.snapshot ? validateSnapshot(record.snapshot) : null };
  }

  get(): Promise<RatesSnapshot> {
    const now = this.now();
    if (this.record.snapshot && (now < this.record.expiresAt || now < this.record.retryAt)) {
      return Promise.resolve(this.record.snapshot);
    }
    if (this.pending) return this.pending;
    if (now < this.record.retryAt) return Promise.reject(new Error('Stored rates unavailable.'));
    this.pending = this.refresh().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async refresh(): Promise<RatesSnapshot> {
    try {
      const snapshot = validateSnapshot(await this.load());
      if (!snapshot.ar && !snapshot.global) throw new Error('Empty rates snapshot.');
      this.record = { snapshot, expiresAt: this.now() + SNAPSHOT_CACHE_MS, retryAt: 0 };
    } catch {
      this.record = { ...this.record, retryAt: this.now() + RETRY_MS };
    }
    await this.persist(this.record);
    if (!this.record.snapshot) throw new Error('Stored rates unavailable.');
    return this.record.snapshot;
  }
}
