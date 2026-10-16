import {BizError, fail, ok} from "@/lib/api-response";
import {
  parseOrThrow,
  platformSchema,
  playerNameSchema,
} from "@/lib/api-schemas";
import {AI_PROMPT_VERSION, isAiAnalysisEnabled} from "@/lib/ai/config";
import {readSeasonReviewCache} from "@/lib/ai/cache";
import {AI_DISCLAIMER, reviewPlayerSeason} from "@/lib/ai/service";
import {getPlayerDashboard} from "@/lib/pubg/service";
import {z} from "zod";

const querySchema = z.object({
  platform: platformSchema,
  name: playerNameSchema,
  seasonId: z.string().trim().max(128).optional(),
  gameMode: z.string().trim().max(64).optional(),
});

function readQuery(request: Request) {
  const {searchParams} = new URL(request.url);
  return parseOrThrow(querySchema, {
    platform: searchParams.get("platform")?.trim() ?? "",
    name: searchParams.get("name")?.trim() ?? "",
    seasonId: searchParams.get("seasonId")?.trim() || undefined,
    gameMode: searchParams.get("gameMode")?.trim() || undefined,
  });
}

/** GET：只读缓存，不触发模型外呼。 */
export async function GET(request: Request) {
  try {
    if (!isAiAnalysisEnabled()) {
      return fail(new BizError("AI 分析未开启", 404, 40403));
    }
    const {platform, name, seasonId, gameMode} = readQuery(request);
    const dashboard = await getPlayerDashboard(platform, name, {
      seasonId,
      gameMode,
      recentLimit: 0,
    });
    const mode = gameMode?.trim() || dashboard.season.selectedGameMode || "";
    const disk = await readSeasonReviewCache(
      dashboard.player.accountId,
      dashboard.season.seasonId,
      mode,
      AI_PROMPT_VERSION,
    );
    if (!disk) {
      return ok(null, {
        cached: false,
        available: true,
        seasonId: dashboard.season.seasonId,
        gameMode: mode || null,
        promptVersion: AI_PROMPT_VERSION,
        disclaimer: AI_DISCLAIMER,
      });
    }
    return ok(
      {
        enabled: true as const,
        cached: true,
        stale: false,
        accountId: disk.accountId,
        platform: disk.platform,
        seasonId: disk.seasonId,
        gameMode: disk.gameMode || null,
        promptVersion: disk.promptVersion,
        model: disk.model,
        narrative: disk.narrative,
        highlights: disk.highlights,
        disclaimer: AI_DISCLAIMER,
        generatedAt: disk.savedAt,
      },
      {cached: true, promptVersion: disk.promptVersion},
    );
  } catch (error) {
    return fail(error);
  }
}

/** POST：生成赛季评价；有缓存且非 force 时直接返回。 */
export async function POST(request: Request) {
  try {
    const {platform, name, seasonId, gameMode} = readQuery(request);
    const {searchParams} = new URL(request.url);
    const force =
      searchParams.get("force") === "1" || searchParams.get("force") === "true";
    const result = await reviewPlayerSeason(platform, name, {
      seasonId,
      gameMode,
      force,
    });
    return ok(result, {
      cached: result.cached,
      stale: result.stale,
      promptVersion: result.promptVersion,
    });
  } catch (error) {
    return fail(error);
  }
}
