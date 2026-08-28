import {BizError, fail, ok} from "@/lib/api-response";
import {refreshPlayer} from "@/lib/pubg/service";
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
    const seasonId = searchParams.get("seasonId")?.trim() || undefined;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空（刷新需按昵称重拉玩家资料）"));
    }

    const result = await refreshPlayer(platform, accountId, name, { seasonId });
    return ok(result, { cooldownSec: result.cooldownSec });
  } catch (error) {
    return fail(error);
  }
}
