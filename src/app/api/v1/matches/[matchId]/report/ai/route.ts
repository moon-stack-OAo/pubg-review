import {BizError, fail, ok} from "@/lib/api-response";
import {
  accountIdSchema,
  matchIdSchema,
  parseOrThrow,
  platformSchema,
} from "@/lib/api-schemas";
import {AI_PROMPT_VERSION, isAiAnalysisEnabled} from "@/lib/ai/config";
import {readAiExplainCache} from "@/lib/ai/cache";
import {AI_DISCLAIMER, explainMatchReport} from "@/lib/ai/service";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {z} from "zod";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

const querySchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
});

/**
 * GET：仅读缓存，不触发外呼。
 * 未开启 → 404；无缓存 → data=null。
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    if (!isAiAnalysisEnabled()) {
      return fail(new BizError("AI 分析未开启", 404, 40403));
    }

    const { matchId: rawMatchId } = await context.params;
    const matchId = parseOrThrow(matchIdSchema, rawMatchId);
    const { searchParams } = new URL(request.url);
    const { platform, accountId } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      accountId: searchParams.get("accountId")?.trim() ?? "",
    });

    const { report } = await buildMatchReport(platform, matchId, accountId);
    const disk = await readAiExplainCache(
      matchId,
      accountId,
      report.ruleVersion,
      AI_PROMPT_VERSION,
    );

    if (!disk) {
      return ok(null, {
        cached: false,
        available: true,
        ruleVersion: report.ruleVersion,
        promptVersion: AI_PROMPT_VERSION,
        disclaimer: AI_DISCLAIMER,
      });
    }

    return ok(
      {
        enabled: true as const,
        cached: true,
        matchId: disk.matchId,
        accountId: disk.accountId,
        ruleVersion: disk.ruleVersion,
        promptVersion: disk.promptVersion,
        model: disk.model,
        narrative: disk.narrative,
        polishedSuggestions: disk.polishedSuggestions,
        ruleSummaryLines: report.summaryLines,
        ruleSuggestions: report.suggestions,
        disclaimer: AI_DISCLAIMER,
        generatedAt: disk.savedAt,
      },
      {
        cached: true,
        ruleVersion: disk.ruleVersion,
        promptVersion: disk.promptVersion,
      },
    );
  } catch (error) {
    return fail(error);
  }
}

/**
 * POST：生成（或 force 重算）AI 解读；有缓存则直接返回。
 * query: platform, accountId；可选 force=1
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { matchId: rawMatchId } = await context.params;
    const matchId = parseOrThrow(matchIdSchema, rawMatchId);
    const { searchParams } = new URL(request.url);
    const { platform, accountId } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      accountId: searchParams.get("accountId")?.trim() ?? "",
    });
    const force =
      searchParams.get("force") === "1" ||
      searchParams.get("force") === "true";

    const result = await explainMatchReport(platform, matchId, accountId, {
      force,
    });
    return ok(result, {
      cached: result.cached,
      ruleVersion: result.ruleVersion,
      promptVersion: result.promptVersion,
    });
  } catch (error) {
    return fail(error);
  }
}
