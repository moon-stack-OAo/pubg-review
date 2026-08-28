import {BizError, fail, ok} from "@/lib/api-response";
import {getCachedSeason} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { accountId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const seasonId = searchParams.get("seasonId")?.trim() || undefined;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }

    const { value: overview, cached } = await getCachedSeason(
      platform,
      accountId,
      seasonId,
    );
    return ok(overview, { cached });
  } catch (error) {
    return fail(error);
  }
}
