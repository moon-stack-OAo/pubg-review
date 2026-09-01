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
  params: Promise<{accountId: string}>;
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
        ctx.addIssue({code: "custom", message: "limit 必须是数字"});
        return z.NEVER;
      }
      return Math.min(Math.max(1, Math.floor(n)), 15);
    }),
  parseRecent: z
    .string()
    .optional()
    .transform((v) => {
      if (v == null || v === "") return 0;
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.min(Math.max(Math.floor(n), 0), 3);
    }),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const {accountId: rawAccountId} = await context.params;
    const accountId = parseOrThrow(accountIdSchema, rawAccountId);
    const {searchParams} = new URL(request.url);
    const {platform, name, limit, parseRecent} = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      name: searchParams.get("name")?.trim() ?? "",
      limit: searchParams.get("limit") ?? undefined,
      parseRecent: searchParams.get("parseRecent") ?? undefined,
    });

    const result = await syncPlayerHistory(platform, accountId, name, {
      limit,
      parseRecent,
    });
    return ok(result, {cooldownSec: result.cooldownSec});
  } catch (error) {
    return fail(error);
  }
}
