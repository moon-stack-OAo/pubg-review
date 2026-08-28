import {z} from "zod";
import {BizError} from "@/lib/errors";
import {PUBG_PLATFORMS, type PubgPlatform} from "@/lib/pubg/types";

export const platformSchema = z.enum(
  PUBG_PLATFORMS as [PubgPlatform, ...PubgPlatform[]],
  { error: "platform 必须是 steam/kakao/xbox/psn" },
);

export const matchIdSchema = z
  .string()
  .trim()
  .min(1, "matchId 不能为空")
  .max(128, "matchId 过长");

export const accountIdSchema = z
  .string()
  .trim()
  .min(1, "accountId 不能为空")
  .max(128, "accountId 过长");

export const playerNameSchema = z
  .string()
  .trim()
  .min(1, "name 不能为空")
  .max(64, "昵称过长");

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const msg = result.error.issues[0]?.message ?? "参数无效";
  throw new BizError(msg, 400, 40001);
}
