import {BizError, fail, ok} from "@/lib/api-response";
import {getPlayerFormAnalysis} from "@/lib/analysis/player-form";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const gameMode = searchParams.get("gameMode")?.trim() || undefined;
    const seasonId = searchParams.get("seasonId")?.trim() || undefined;
    const limitRaw = Number(searchParams.get("limit") ?? "20");

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const data = await getPlayerFormAnalysis(platform, name, {
      gameMode,
      seasonId,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
    });

    return ok(data, {
      sampleSize: data.form.recent.sampleSize,
      status: data.form.status,
      anomalyCount: data.anomalies.length,
    });
  } catch (error) {
    return fail(error);
  }
}
