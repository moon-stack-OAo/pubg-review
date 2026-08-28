/**
 * 进程内滑动窗口限流（按 IP，粗粒度）。
 * 适用于单机 / next dev；多实例需换 Redis。
 *
 * TRUST_PROXY=true 时才信任 X-Forwarded-For / X-Real-IP；
 * 生产应由 Nginx 等覆盖这些头，勿直接暴露 Node 端口。
 */

type WindowState = {
  /** 请求时间戳（ms） */
  hits: number[];
};

const windows = new Map<string, WindowState>();

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
let lastGlobalPruneAt = 0;
const GLOBAL_PRUNE_INTERVAL_MS = 30_000;

function clampRpm(raw: number, fallback: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.max(Math.floor(raw), 1), 10_000);
}

function getRpm(): number {
  return clampRpm(Number(process.env.RATE_LIMIT_RPM ?? "30"), 30);
}

export function getMutationRpm(): number {
  const raw = Number(process.env.RATE_LIMIT_MUTATION_RPM);
  if (Number.isFinite(raw) && raw > 0) {
    return clampRpm(raw, 10);
  }
  return Math.max(1, Math.floor(getRpm() / 3));
}

function trustProxy(): boolean {
  const v = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

function prune(hits: number[], now: number): number[] {
  const from = now - WINDOW_MS;
  return hits.filter((t) => t > from);
}

function pruneWindows(now: number): void {
  if (now - lastGlobalPruneAt < GLOBAL_PRUNE_INTERVAL_MS && windows.size <= MAX_KEYS) {
    return;
  }
  lastGlobalPruneAt = now;
  for (const [key, state] of windows) {
    state.hits = prune(state.hits, now);
    if (state.hits.length === 0) {
      windows.delete(key);
    }
  }
  while (windows.size > MAX_KEYS) {
    const oldest = windows.keys().next().value;
    if (oldest == null) break;
    windows.delete(oldest);
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; retryAfterSec: number; limit: number };

export type ConsumeRateLimitOptions = {
  /** 自定义每分钟配额；默认读 RATE_LIMIT_RPM */
  rpm?: number;
};

/**
 * 消耗一次配额；超限返回 retryAfterSec。
 */
export function consumeRateLimit(
  key: string,
  options?: ConsumeRateLimitOptions,
): RateLimitResult {
  const limit =
    options?.rpm != null ? clampRpm(options.rpm, getRpm()) : getRpm();
  const now = Date.now();
  pruneWindows(now);

  let state = windows.get(key);
  if (!state) {
    state = { hits: [] };
    windows.set(key, state);
  }
  state.hits = prune(state.hits, now);

  if (state.hits.length >= limit) {
    const oldest = state.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec, limit };
  }

  state.hits.push(now);
  return { ok: true, remaining: limit - state.hits.length, limit };
}

/** 从 Request / NextRequest 提取客户端 IP（粗粒度） */
export function getClientIp(request: Request): string {
  if (!trustProxy()) {
    return "unknown";
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimitKeyFromRequest(request: Request): string {
  return `ip:${getClientIp(request)}`;
}
