import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import {consumeRateLimit, getClientIp} from "@/lib/rate-limit";

/**
 * Next.js 16：middleware 已更名为 proxy。
 * 仅对 BFF `/api/v1/*` 做 IP 滑动窗口限流。
 */
export function proxy(request: NextRequest) {
  const result = consumeRateLimit(`ip:${getClientIp(request)}`);
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
  matcher: ["/api/v1/:path*"],
};
