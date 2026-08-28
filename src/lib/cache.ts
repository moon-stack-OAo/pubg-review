type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 2000;

function evictIfNeeded(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, e] of store) {
    if (now > e.expiresAt) store.delete(k);
  }
  if (store.size < MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES + 1;
  let n = 0;
  for (const k of store.keys()) {
    store.delete(k);
    if (++n >= overflow) break;
  }
}

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  evictIfNeeded();
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/** 按前缀删除缓存（用于玩家刷新时失效相关条目） */
export function cacheDeleteByPrefix(prefix: string): number {
  let count = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      count += 1;
    }
  }
  return count;
}

/** 按谓词删除缓存 */
export function cacheDeleteIf(pred: (key: string) => boolean): number {
  let count = 0;
  for (const key of store.keys()) {
    if (pred(key)) {
      store.delete(key);
      count += 1;
    }
  }
  return count;
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
  season: 10 * 60 * 1000,
  seasonsList: 6 * 60 * 60 * 1000,
  match: 24 * 60 * 60 * 1000,
  /** 报告可按 ruleVersion 长期缓存；调试用 rebuild 清缓存 */
  matchReport: 7 * 24 * 60 * 60 * 1000,
} as const;
