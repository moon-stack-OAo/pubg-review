import {fail, ok} from "@/lib/api-response";
import {
  accountIdSchema,
  parseOrThrow,
  platformSchema,
  playerNameSchema,
} from "@/lib/api-schemas";
import {getPlayerWindowStats} from "@/lib/history/service";
import {z} from "zod";

const querySchema = z
  .object({
    platform: platformSchema,
    name: playerNameSchema.optional(),
    accountId: accountIdSchema.optional(),
    hours: z
      .string()
      .optional()
      .transform((v) => {
        if (v == null || v === "") return undefined;
        const n = Number(v);
        if (!Number.isFinite(n)) return undefined;
        return Math.min(Math.max(Math.floor(n), 1), 168);
      }),
    since: z.string().trim().min(1).max(64).optional(),
    until: z.string().trim().min(1).max(64).optional(),
    date: z.string().trim().min(1).max(32).optional(),
    tz: z.string().trim().min(1).max(64).optional(),
    gameMode: z.string().trim().min(1).max(64).optional(),
    matchLimit: z
      .string()
      .optional()
      .transform((v) => {
        if (v == null || v === "") return undefined;
        const n = Number(v);
        if (!Number.isFinite(n)) return undefined;
        return Math.min(Math.max(Math.floor(n), 1), 100);
      }),
  })
  .refine((v) => Boolean(v.name || v.accountId), {
    message: "name 或 accountId 不能为空",
  })
  .refine(
    (v) =>
      !(
        v.date &&
        (v.since != null || v.until != null || v.hours != null)
      ),
    {
      message: "date 不能与 since/until/hours 同时使用",
    },
  );

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = parseOrThrow(querySchema, {
      platform: searchParams.get("platform")?.trim() ?? "",
      name: searchParams.get("name")?.trim() || undefined,
      accountId: searchParams.get("accountId")?.trim() || undefined,
      hours: searchParams.get("hours") ?? undefined,
      since: searchParams.get("since")?.trim() || undefined,
      until: searchParams.get("until")?.trim() || undefined,
      date: searchParams.get("date")?.trim() || undefined,
      tz: searchParams.get("tz")?.trim() || undefined,
      gameMode: searchParams.get("gameMode")?.trim() || undefined,
      matchLimit: searchParams.get("matchLimit") ?? undefined,
    });

    const data = await getPlayerWindowStats(q.platform, {
      name: q.name,
      accountId: q.accountId,
      hours: q.hours,
      since: q.since,
      until: q.until,
      date: q.date,
      tz: q.tz,
      gameMode: q.gameMode,
      matchLimit: q.matchLimit,
    });

    return ok(data, {
      hours: data.hours,
      sampleSize: data.kpi.matches,
      emptyReason: data.emptyReason,
    });
  } catch (error) {
    return fail(error);
  }
}
