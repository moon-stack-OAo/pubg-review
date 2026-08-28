import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import {consumeRateLimit, getClientIp, getMutationRpm} from "@/lib/rate-limit";

/**
 * Next.js 16：middleware 已更名为 proxy。
 * 对 BFF `/api/v1/*` 与 `/mcp` 做 IP 滑动窗口限流；写操作更严。
 */
function isMutationRequest(request: NextRequest): boolean {
  const {pathname, searchParams} = request.nextUrl;
  if (
    pathname.includes("/telemetry/parse") ||
    pathname.includes("/report/rebuild") ||
    pathname.includes("/history/sync") ||
    pathname.includes("/refresh")
  ) {
    return true;
  }
  const force = searchParams.get("force");
  const refresh = searchParams.get("refresh");
  if (force === "1" || force === "true") return true;
  if (refresh === "1" || refresh === "true") return true;
  return false;
}

export function proxy(request: NextRequest) {
  const ip = getClientIp(request);
  const mutation = isMutationRequest(request);
  const key = mutation ? `mut:${ip}` : `ip:${ip}`;
  const result = consumeRateLimit(
    key,
    mutation ? { rpm: getMutationRpm() } : undefined,
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        code: 42902,
        message: `请求过于频繁，请 ${result.retryAfterSec} 秒后再试`,
        data: null,
        meta: {
          retryAfterSec: result.retryAfterSec,
          limit: result.limit,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSec),
        },
      },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/mcp", "/mcp/:path*"],
};
