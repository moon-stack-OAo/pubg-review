type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  matchBytes: number | null;
};

export const CACHE_LIMITS = {
  maxEntries: 2000,
  matchMaxEntries: 64,
  matchMaxBytes: 16 * 1024 * 1024,
  cleanupIntervalMs: 60_000,
} as const;

type CacheSetOptions = { category: "match"; estimatedBytes: number };
type MemoryCacheOptions = {
  maxEntries?: number;
  matchMaxEntries?: number;
  matchMaxBytes?: number;
  cleanupIntervalMs?: number;
  clock?: () => number;
};

export class MemoryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly limits;
  private readonly clock: () => number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private matchEntries = 0;
  private matchBytes = 0;

  constructor(options: MemoryCacheOptions = {}) {
    this.limits = { ...CACHE_LIMITS, ...options };
    this.clock = options.clock ?? Date.now;
    for (const limit of [this.limits.maxEntries, this.limits.matchMaxEntries,
      this.limits.matchMaxBytes, this.limits.cleanupIntervalMs]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error("缓存容量和清理间隔必须为正整数");
      }
    }
  }

  get stats() {
    return { entries: this.store.size, matchEntries: this.matchEntries, matchBytes: this.matchBytes };
  }

  get<T>(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (this.clock() >= hit.expiresAt) {
      this.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number, options?: CacheSetOptions): boolean {
    this.delete(key);
    const expiresAt = this.clock() + ttlMs;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isFinite(expiresAt)) return false;
    if (options && (!Number.isSafeInteger(options.estimatedBytes) || options.estimatedBytes < 0)) return false;
    const matchBytes = options ? options.estimatedBytes + key.length * 2 + 128 : null;
    if (matchBytes !== null && (!Number.isSafeInteger(matchBytes) ||
      matchBytes <= 0 || matchBytes > this.limits.matchMaxBytes)) return false;

    this.pruneExpired();
    if (matchBytes !== null) {
      for (const [oldKey, entry] of this.store) {
        if (this.matchEntries < this.limits.matchMaxEntries &&
          this.matchBytes + matchBytes <= this.limits.matchMaxBytes) break;
        if (entry.matchBytes !== null) this.delete(oldKey);
      }
    }
    while (this.store.size >= this.limits.maxEntries) {
      this.delete(this.store.keys().next().value!);
    }
    this.store.set(key, { value, expiresAt, matchBytes });
    if (matchBytes !== null) {
      this.matchEntries += 1;
      this.matchBytes += matchBytes;
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.pruneExpired(), this.limits.cleanupIntervalMs);
      this.timer.unref();
    }
    return true;
  }

  delete(key: string): void {
    const entry = this.store.get(key);
    if (!entry) return;
    this.store.delete(key);
    if (entry.matchBytes !== null) {
      this.matchEntries -= 1;
      this.matchBytes -= entry.matchBytes;
    }
    if (!this.store.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  pruneExpired(): void {
    const now = this.clock();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) this.delete(key);
    }
  }

  deleteIf(pred: (key: string) => boolean): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (pred(key)) {
        this.delete(key);
        count += 1;
      }
    }
    return count;
  }
}

const cache = new MemoryCache();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | null {
  return cache.get<T>(key);
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, options?: CacheSetOptions): void {
  cache.set(key, value, ttlMs, options);
}

export function cacheDelete(key: string): void {
  cache.delete(key);
}

/** 按前缀删除缓存（用于玩家刷新时失效相关条目） */
export function cacheDeleteByPrefix(prefix: string): number {
  return cache.deleteIf((key) => key.startsWith(prefix));
}

/** 按谓词删除缓存 */
export function cacheDeleteIf(pred: (key: string) => boolean): number {
  return cache.deleteIf(pred);
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const existing = cacheGet<T>(key);
  if (existing !== null) {
    return { value: existing, cached: true };
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) {
    const value = await running;
    return { value, cached: true };
  }

  const job = (async () => {
    const value = await loader();
    cacheSet(key, value, ttlMs);
    return value;
  })();
  inflight.set(key, job);
  try {
    const value = await job;
    return { value, cached: false };
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

export const TTL = {
  playerByName: 30 * 60 * 1000,
  clan: 6 * 60 * 60 * 1000,
  season: 10 * 60 * 1000,
  seasonsList: 6 * 60 * 60 * 1000,
  match: 24 * 60 * 60 * 1000,
  /** 报告可按 ruleVersion 长期缓存；调试用 rebuild 清缓存 */
  matchReport: 7 * 24 * 60 * 60 * 1000,
} as const;
