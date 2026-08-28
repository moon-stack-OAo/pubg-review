import {BizError, fail, ok} from "@/lib/api-response";
import {isPubgPlatform} from "@/lib/pubg/types";
import {getTelemetryEvents} from "@/lib/telemetry/service";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const accountId = searchParams.get("accountId")?.trim() || undefined;
    const types = searchParams.get("types")?.trim() || undefined;
    const sampleHzRaw = searchParams.get("sampleHz");
    const sampleHz =
      sampleHzRaw != null && sampleHzRaw !== ""
        ? Number(sampleHzRaw)
        : undefined;
    const autoParse = searchParams.get("autoParse") !== "0";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!matchId?.trim()) {
      return fail(new BizError("matchId 不能为空"));
    }
    if (sampleHz != null && (!Number.isFinite(sampleHz) || sampleHz <= 0)) {
      return fail(new BizError("sampleHz 必须为正数"));
    }

    const data = await getTelemetryEvents(platform, matchId, {
      accountId,
      types,
      sampleHz,
      autoParse,
    });

    return ok(data, {
      cached: data.status === "ready",
      telemetryStatus: data.status,
    });
  } catch (error) {
    return fail(error);
  }
}
