import {BizError, fail, ok} from "@/lib/api-response";
import {getPlayerDashboard} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const gameMode = searchParams.get("gameMode")?.trim() || undefined;
    const seasonId = searchParams.get("seasonId")?.trim() || undefined;
    const recentLimit = Number(searchParams.get("recentLimit") ?? "8");

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const dashboard = await getPlayerDashboard(platform, name, {
      gameMode,
      seasonId,
      recentLimit: Number.isFinite(recentLimit)
        ? Math.min(Math.max(recentLimit, 1), 20)
        : 5,
    });

    return ok(dashboard, {
      cached: dashboard.cached,
    });
  } catch (error) {
    return fail(error);
  }
}
