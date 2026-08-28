import {BizError, fail, ok} from "@/lib/api-response";
import {getCachedMatch} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";
import {getTelemetryStatus} from "@/lib/telemetry/service";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const accountId = searchParams.get("accountId")?.trim() || undefined;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!matchId) {
      return fail(new BizError("matchId 不能为空"));
    }

    const { value: match, cached } = await getCachedMatch(platform, matchId);
    const focus =
      accountId == null
        ? null
        : match.rosters
            .flatMap((r) => r.participants)
            .find((p) => p.accountId === accountId) ?? null;

    const telemetryStatus = await getTelemetryStatus(matchId);

    return ok(
      {
        ...match,
        /** 不向前端暴露官方 telemetry CDN URL */
        telemetryUrl: undefined,
        hasTelemetryAsset: Boolean(match.telemetryUrl),
        telemetryStatus,
        focusAccountId: accountId ?? null,
        focusParticipant: focus,
      },
      { cached },
    );
  } catch (error) {
    return fail(error);
  }
}
