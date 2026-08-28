import {BizError, fail, ok} from "@/lib/api-response";
import {rebuildMatchReport} from "@/lib/analysis/report-service";
import {isPubgPlatform} from "@/lib/pubg/types";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const accountId = searchParams.get("accountId")?.trim() ?? "";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!matchId) {
      return fail(new BizError("matchId 不能为空"));
    }
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }

    const { report } = await rebuildMatchReport(platform, matchId, accountId);
    return ok(report, {
      cached: false,
      rebuilt: true,
      ruleVersion: report.ruleVersion,
    });
  } catch (error) {
    return fail(error);
  }
}
