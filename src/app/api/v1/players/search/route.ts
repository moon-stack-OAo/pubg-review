import {BizError, fail, ok} from "@/lib/api-response";
import {getCachedPlayer} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const { value: player, cached } = await getCachedPlayer(platform, name);
    return ok(
      {
        accountId: player.accountId,
        name: player.name,
        platform: player.platform,
        shard: player.shard,
        banType: player.banType,
        recentMatchCount: player.matchIds.length,
      },
      { cached },
    );
  } catch (error) {
    return fail(error);
  }
}
