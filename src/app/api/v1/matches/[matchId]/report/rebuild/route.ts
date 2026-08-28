import {fail, ok} from "@/lib/api-response";
import {
  accountIdSchema,
  matchIdSchema,
  parseOrThrow,
  platformSchema,
} from "@/lib/api-schemas";
import {rebuildMatchReport} from "@/lib/analysis/report-service";
import {z} from "zod";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

const querySchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId: rawMatchId } = await context.params;
    const matchId = parseOrThrow(matchIdSchema, rawMatchId);
    const { searchParams } = new URL(request.url);
    const { platform, accountId } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      accountId: searchParams.get("accountId")?.trim() ?? "",
    });

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
