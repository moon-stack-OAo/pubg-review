import {BizError, fail, ok} from "@/lib/api-response";
import {buildCompareSide} from "@/lib/history/service";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const nameA = searchParams.get("nameA")?.trim() ?? "";
    const nameB = searchParams.get("nameB")?.trim() ?? "";
    const gameMode = searchParams.get("gameMode")?.trim() || undefined;
    const seasonId = searchParams.get("seasonId")?.trim() || undefined;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!nameA || !nameB) {
      return fail(new BizError("nameA 与 nameB 均不能为空"));
    }
    if (nameA.toLowerCase() === nameB.toLowerCase()) {
      return fail(new BizError("请输入两个不同的昵称"));
    }

    // 串行：避免同时打两次 search 顶满 RPM
    const a = await buildCompareSide(platform, nameA, { gameMode, seasonId });
    const b = await buildCompareSide(platform, nameB, { gameMode, seasonId });

    return ok({
      platform,
      gameMode: gameMode ?? a.gameMode,
      seasonId: seasonId ?? null,
      players: [a, b],
    });
  } catch (error) {
    return fail(error);
  }
}
