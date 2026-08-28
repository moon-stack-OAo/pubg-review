/**
 * 进程内滑动窗口限流（按 IP，粗粒度）。
 * 适用于单机 / next dev；多实例需换 Redis。
 */

type WindowState = {
  /** 请求时间戳（ms） */
  hits: number[];
};

const windows = new Map<string, WindowState>();

const WINDOW_MS = 60_000;

function getRpm(): number {
  const raw = Number(process.env.RATE_LIMIT_RPM ?? "30");
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 10_000);
}

function prune(hits: number[], now: number): number[] {
  const from = now - WINDOW_MS;
  return hits.filter((t) => t > from);
}

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; retryAfterSec: number; limit: number };

/**
 * 消耗一次配额；超限返回 retryAfterSec。
 */
export function consumeRateLimit(key: string): RateLimitResult {
  const limit = getRpm();
  const now = Date.now();
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
