import {fail, ok} from "@/lib/api-response";
import {BizError} from "@/lib/errors";
import {readApiSyncLogs} from "@/lib/sync-log";

/**
 * 开发用：查看近期上游 PUBG 调用日志（不含 API Key）。
 * 生产环境 NODE_ENV=production 时拒绝访问。
 * 限流由 src/proxy.ts 统一处理。
 */
export async function GET(request: Request) {
  try {
    void request;
    if (process.env.NODE_ENV === "production") {
      return fail(new BizError("仅开发环境可用", 403, 40301));
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "50");
    const items = await readApiSyncLogs(
      Number.isFinite(limit) ? limit : 50,
    );
    return ok({ items, count: items.length });
  } catch (error) {
    return fail(error);
  }
}
