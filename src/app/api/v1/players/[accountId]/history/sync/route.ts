import {BizError, fail, ok} from "@/lib/api-response";
import {syncPlayerHistory} from "@/lib/history/service";
import {isPubgPlatform} from "@/lib/pubg/types";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { accountId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const result = await syncPlayerHistory(platform, accountId, name, {
      limit:
        limit != null && Number.isFinite(limit)
          ? Math.min(Math.max(1, limit), 15)
          : undefined,
    });
    return ok(result, { cooldownSec: result.cooldownSec });
  } catch (error) {
    return fail(error);
  }
}
