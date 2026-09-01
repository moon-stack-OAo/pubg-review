import {fail, ok} from "@/lib/api-response";
import {
  accountIdSchema,
  parseOrThrow,
  platformSchema,
  playerNameSchema,
} from "@/lib/api-schemas";
import {syncPlayerHistory} from "@/lib/history/service";
import {z} from "zod";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const querySchema = z.object({
  platform: platformSchema,
  name: playerNameSchema,
  limit: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v == null || v === "") return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "limit 必须是数字" });
        return z.NEVER;
      }
      return Math.min(Math.max(1, Math.floor(n)), 15);
    }),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseOrThrow(accountIdSchema, rawAccountId);
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const parseRecentRaw = searchParams.get("parseRecent");
    const parseRecentNum = parseRecentRaw ? Number(parseRecentRaw) : 0;
    const parseRecent =
      Number.isFinite(parseRecentNum)
        ? Math.min(Math.max(Math.floor(parseRecentNum), 0), 3)
        : 0;

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }
    const { platform, name, limit } = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      name: searchParams.get("name")?.trim() ?? "",
      limit: searchParams.get("limit") ?? undefined,
    });

    const result = await syncPlayerHistory(platform, accountId, name, {
      limit:
        limit != null && Number.isFinite(limit)
          ? Math.min(Math.max(1, limit), 15)
          : undefined,
      parseRecent,
    });
    return ok(result, { cooldownSec: result.cooldownSec });
  } catch (error) {
    return fail(error);
  }
}
