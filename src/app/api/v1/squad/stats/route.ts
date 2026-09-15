import {BizError, fail, ok} from "@/lib/api-response";
import {clampWindowHours, MAX_WINDOW_HOURS} from "@/lib/history/service";
import {getSquadStats} from "@/lib/squad/stats";
import {isPubgPlatform} from "@/lib/pubg/types";

function splitCsv(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOptionalHours(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return clampWindowHours(n);
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
    const hours = parseOptionalHours(searchParams.get("hours"));
    const since = searchParams.get("since")?.trim() || undefined;
    const until = searchParams.get("until")?.trim() || undefined;
    const date = searchParams.get("date")?.trim() || undefined;
    const tz = searchParams.get("tz")?.trim() || undefined;
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
    if (since) {
      const sinceMs = Date.parse(since);
      if (!Number.isFinite(sinceMs)) {
        return fail(new BizError("since 必须是合法 ISO 时间"));
      }
    }
    if (until) {
      const untilMs = Date.parse(until);
      if (!Number.isFinite(untilMs)) {
        return fail(new BizError("until 必须是合法 ISO 时间"));
      }
    }

    const data = await getSquadStats({
      platform,
      playerName: name,
      mateNames: mates,
      mateAccountIds: mateIds,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
      gameMode,
      hours,
      since,
      until,
      date,
      tz,
      refresh,
    });

    return ok(data, {
      hours: data.hours,
      since: data.since,
      until: data.until,
      date: data.date ?? null,
      label: data.label ?? null,
      fullSquad: data.sample.fullSquad,
      scanned: data.sample.scanned,
      maxWindowHours: MAX_WINDOW_HOURS,
    });
  } catch (error) {
    return fail(error);
  }
}
