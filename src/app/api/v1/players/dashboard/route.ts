import {fail, ok} from "@/lib/api-response";
import {
  parseOrThrow,
  platformSchema,
  playerNameSchema,
} from "@/lib/api-schemas";
import {getPlayerDashboard} from "@/lib/pubg/service";
import {z} from "zod";

const querySchema = z.object({
  platform: platformSchema,
  name: playerNameSchema,
  gameMode: z.string().trim().min(1).max(64).optional(),
  seasonId: z.string().trim().min(1).max(128).optional(),
  recentLimit: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? "8");
      if (!Number.isFinite(n)) return 5;
      return Math.min(Math.max(Math.floor(n), 1), 20);
    }),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { platform, name, gameMode, seasonId, recentLimit } = parseOrThrow(
      querySchema,
      {
        platform: searchParams.get("platform")?.trim() ?? "",
        name: searchParams.get("name")?.trim() ?? "",
        gameMode: searchParams.get("gameMode")?.trim() || undefined,
        seasonId: searchParams.get("seasonId")?.trim() || undefined,
        recentLimit: searchParams.get("recentLimit") ?? undefined,
      },
    );

    const dashboard = await getPlayerDashboard(platform, name, {
      gameMode,
      seasonId,
      recentLimit,
    });

    return ok(dashboard, {
      cached: dashboard.cached,
    });
  } catch (error) {
    return fail(error);
  }
}
