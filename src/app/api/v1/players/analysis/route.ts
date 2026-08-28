import {BizError, fail, ok} from "@/lib/api-response";
import {getPlayerAnalysisByName} from "@/lib/analysis/player-analysis";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const accountId = searchParams.get("accountId")?.trim() ?? "";
    const range = searchParams.get("range")?.trim() || "20m";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name && !accountId) {
      return fail(new BizError("name 或 accountId 不能为空"));
    }
    if (!name) {
      return fail(
        new BizError("当前版本需提供 name 以拉取近期对局列表并聚合分析"),
      );
    }

    const analysis = await getPlayerAnalysisByName(platform, name, { range });
    return ok(analysis, {
      sampleSize: analysis.sampleSize,
      range: analysis.range,
    });
  } catch (error) {
    return fail(error);
  }
}
