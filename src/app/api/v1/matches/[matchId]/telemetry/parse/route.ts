import {fail, ok} from "@/lib/api-response";
import {
  matchIdSchema,
  parseOrThrow,
  platformSchema,
} from "@/lib/api-schemas";
import {parseMatchTelemetry} from "@/lib/telemetry/service";
import {z} from "zod";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

const querySchema = z.object({
  platform: platformSchema,
  force: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId: rawMatchId } = await context.params;
    const matchId = parseOrThrow(matchIdSchema, rawMatchId);
    const { searchParams } = new URL(request.url);
    const { platform, force } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      force: searchParams.get("force") ?? undefined,
    });

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
