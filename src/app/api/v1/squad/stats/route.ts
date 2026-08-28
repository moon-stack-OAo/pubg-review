import {BizError, fail, ok} from "@/lib/api-response";
import {getSquadStats} from "@/lib/squad/stats";
import {isPubgPlatform} from "@/lib/pubg/types";

function splitCsv(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const mates = splitCsv(searchParams.get("mates"));
    const mateIds = splitCsv(
      searchParams.get("mateIds") ?? searchParams.get("mateAccountIds"),
    );
    const gameMode = searchParams.get("gameMode")?.trim() || undefined;
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const refresh =
      searchParams.get("refresh") === "1" ||
      searchParams.get("refresh") === "true";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }
    if (mates.length === 0 && mateIds.length === 0) {
      return fail(new BizError("请至少指定 1 名队友（mates 或 mateIds）"));
    }

    const data = await getSquadStats({
      platform,
      playerName: name,
      mateNames: mates,
      mateAccountIds: mateIds,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
      gameMode,
      refresh,
    });

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
