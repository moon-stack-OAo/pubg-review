import {fail, ok} from "@/lib/api-response";
import {
  accountIdSchema,
  parseOrThrow,
  platformSchema,
  playerNameSchema,
} from "@/lib/api-schemas";
import {refreshPlayer} from "@/lib/pubg/service";
import {z} from "zod";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const querySchema = z.object({
  platform: platformSchema,
  name: playerNameSchema,
  seasonId: z.string().trim().min(1).max(128).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseOrThrow(accountIdSchema, rawAccountId);
    const { searchParams } = new URL(request.url);
    const seasonRaw = searchParams.get("seasonId")?.trim() || undefined;
    const { platform, name, seasonId } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      name: searchParams.get("name")?.trim() ?? "",
      seasonId: seasonRaw,
    });

    const result = await refreshPlayer(platform, accountId, name, { seasonId });
    return ok(result, { cooldownSec: result.cooldownSec });
  } catch (error) {
    return fail(error);
  }
}
