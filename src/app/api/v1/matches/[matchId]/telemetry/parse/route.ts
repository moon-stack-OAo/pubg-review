import {BizError, fail, ok} from "@/lib/api-response";
import {isPubgPlatform} from "@/lib/pubg/types";
import {parseMatchTelemetry} from "@/lib/telemetry/service";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const force = searchParams.get("force") === "1";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!matchId?.trim()) {
      return fail(new BizError("matchId 不能为空"));
    }

    const { meta, cached } = await parseMatchTelemetry(platform, matchId, {
      force,
    });

    if (meta.status === "failed" || meta.status === "expired") {
      return ok(
        {
          matchId: meta.matchId,
          status: meta.status,
          errorMessage: meta.errorMessage,
          parserVersion: meta.parserVersion,
          parsedAt: meta.parsedAt,
        },
        { cached },
      );
    }

    return ok(
      {
        matchId: meta.matchId,
        status: meta.status,
        errorMessage: meta.errorMessage,
        parserVersion: meta.parserVersion,
        parsedAt: meta.parsedAt,
        mapName: meta.mapName ?? null,
        durationSec: meta.durationSec ?? null,
      },
      { cached },
    );
  } catch (error) {
    return fail(error);
  }
}
