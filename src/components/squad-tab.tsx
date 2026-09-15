"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ExportSquadCsv} from "@/components/export-squad-csv";
import {GameModeChips} from "@/components/ui";
import {formatDateTime, formatDuration, formatNumber, formatPercent, rankClass,} from "@/lib/format";
import {readSquadMates, writeSquadMates,} from "@/lib/squad-mates-storage";
import type {SquadMatchRow, SquadMemberStats, SquadSampleMeta, SquadStatsResult,} from "@/lib/squad/types";

const DEFAULT_LIMIT = 20;
/** 空=不过滤模式（兼容 squad / squad-fpp） */
const DEFAULT_GAME_MODE = "";
const MAX_MATES = 3;
const WINDOW_24H = 24;
const SHANGHAI_TZ = "Asia/Shanghai";

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T | null;
};

/** 车队时间范围模式；date 与 hours 互斥 */
type SquadRangeMode = "matches" | "hours24" | "today" | "yesterday" | "pick";

function splitMates(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_MATES);
}

/** Asia/Shanghai 当前日历日 YYYY-MM-DD；offsetDays=-1 为昨日 */
function shanghaiDateKey(offsetDays = 0): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const utcNoon = Date.UTC(y, m - 1, d + offsetDays, 12);
  const shifted = new Date(utcNoon);
  const y2 = shifted.getUTCFullYear();
  const m2 = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

function shiftDateKey(dateKey: string, offsetDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcNoon = Date.UTC(y, m - 1, d + offsetDays, 12);
  const shifted = new Date(utcNoon);
  const y2 = shifted.getUTCFullYear();
  const m2 = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

function formatDateKeyZh(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function resolveRangeMode(
  hours: number | null | undefined,
  date: string | null | undefined,
): SquadRangeMode {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const today = shanghaiDateKey(0);
    if (date === today) return "today";
    if (date === shiftDateKey(today, -1)) return "yesterday";
    return "pick";
  }
  if (hours != null && Number.isFinite(hours)) return "hours24";
  return "matches";
}

function buildSquadHref(
  platform: string,
  name: string,
  opts: {
    mates: string[];
    limit: number;
    gameMode: string;
    hours?: number | null;
    date?: string | null;
    tz?: string | null;
  },
): string {
  const q = new URLSearchParams();
  q.set("tab", "squad");
  if (opts.mates.length) q.set("mates", opts.mates.join(","));
  if (opts.limit !== DEFAULT_LIMIT) q.set("limit", String(opts.limit));
  if (opts.gameMode) q.set("gameMode", opts.gameMode);
  // date 与 hours 互斥
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    q.set("date", opts.date);
    if (opts.tz && opts.tz !== SHANGHAI_TZ) q.set("tz", opts.tz);
  } else if (opts.hours != null && Number.isFinite(opts.hours)) {
    q.set("hours", String(opts.hours));
  }
  return `/player/${platform}/${encodeURIComponent(name)}?${q.toString()}`;
}

function sampleTitle(
  stats: SquadStatsResult,
  rangeMode: SquadRangeMode,
): string {
  if (stats.label === "calendar_day" || stats.date) {
    const dateKey = stats.date ?? "";
    if (rangeMode === "today") return "今日日报";
    if (rangeMode === "yesterday") return "昨日日报";
    if (dateKey) return `${formatDateKeyZh(dateKey)} · 北京时间`;
    return "自然日日报";
  }
  if (stats.label === "rolling" || stats.hours != null) {
    if (stats.hours === 24) return "近 24 小时样本";
    if (stats.hours != null) return `近 ${stats.hours} 小时样本`;
  }
  return "样本";
}

export function SquadMatesForm({
  platform,
  name,
  accountId,
  initialMates,
  initialLimit,
  initialGameMode,
  initialHours,
  initialDate,
  initialTz,
}: {
  platform: string;
  name: string;
  accountId: string;
  initialMates: string[];
  initialLimit: number;
  initialGameMode: string;
  initialHours?: number | null;
  initialDate?: string | null;
  initialTz?: string | null;
}) {
  const router = useRouter();
  const playerKey = accountId || name;
  const [matesInput, setMatesInput] = useState(initialMates.join(", "));
  const [limit, setLimit] = useState(String(initialLimit || DEFAULT_LIMIT));
  const [gameMode, setGameMode] = useState(initialGameMode);
  const [rangeMode, setRangeMode] = useState<SquadRangeMode>(() =>
    resolveRangeMode(initialHours, initialDate),
  );
  const [pickedDate, setPickedDate] = useState(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      return initialDate;
    }
    return shanghaiDateKey(0);
  });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const hydratedRef = useRef(false);

  const isWindowMode = rangeMode !== "matches";

  // URL 有 mates → 写入 localStorage；无 mates → 从本地回填（仅 router.replace，由表单 key 重挂载）
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (initialMates.length > 0) {
      writeSquadMates(playerKey, {
        mates: initialMates,
        limit: initialLimit || DEFAULT_LIMIT,
        gameMode: initialGameMode,
      });
      return;
    }

    const stored = readSquadMates(playerKey);
    if (!stored?.mates.length) return;

    router.replace(
      buildSquadHref(platform, name, {
        mates: stored.mates,
        limit: stored.limit ?? DEFAULT_LIMIT,
        gameMode: stored.gameMode ?? DEFAULT_GAME_MODE,
        hours: initialDate ? null : initialHours,
        date: initialDate,
        tz: initialTz,
      }),
    );
  }, [
    initialMates,
    initialLimit,
    initialGameMode,
    initialHours,
    initialDate,
    initialTz,
    playerKey,
    platform,
    name,
    router,
  ]);

  const persistAndGo = useCallback(
    (
      mates: string[],
      nextLimit: number,
      nextMode: string,
      nextRange: SquadRangeMode,
      nextPickDate: string,
    ) => {
      writeSquadMates(playerKey, {
        mates,
        limit: nextLimit,
        gameMode: nextMode,
      });
      let hours: number | null = null;
      let date: string | null = null;
      if (nextRange === "hours24") {
        hours = WINDOW_24H;
      } else if (nextRange === "today") {
        date = shanghaiDateKey(0);
      } else if (nextRange === "yesterday") {
        date = shanghaiDateKey(-1);
      } else if (nextRange === "pick") {
        date =
          nextPickDate && /^\d{4}-\d{2}-\d{2}$/.test(nextPickDate)
            ? nextPickDate
            : shanghaiDateKey(0);
      }
      router.push(
        buildSquadHref(platform, name, {
          mates,
          limit: nextLimit,
          gameMode: nextMode,
          hours,
          date,
        }),
      );
    },
    [playerKey, platform, name, router],
  );

  function parsedLimit(): number {
    const lim = Number(limit);
    return Number.isFinite(lim) && lim > 0
      ? Math.min(Math.floor(lim), 32)
      : DEFAULT_LIMIT;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mates = splitMates(matesInput);
    if (mates.length === 0) {
      setSuggestError("请至少填写 1 名队友昵称");
      return;
    }
    setSuggestError("");
    persistAndGo(mates, parsedLimit(), gameMode.trim(), rangeMode, pickedDate);
  }

  async function onSuggest() {
    setSuggesting(true);
    setSuggestError("");
    try {
      const q = new URLSearchParams({
        platform,
        name,
        scan: "12",
      });
      const res = await fetch(`/api/v1/squad/suggest-mates?${q}`);
      const body = (await res.json()) as ApiEnvelope<{
        mates: { name: string; togetherCount: number }[];
      }>;
      if (!res.ok || body.code !== 0 || !body.data) {
        throw new Error(body.message || "识别失败");
      }
      const names = body.data.mates
        .map((m) => m.name)
        .filter(Boolean)
        .slice(0, MAX_MATES);
      if (names.length === 0) {
        setSuggestError("未识别到常一起的队友，请手动填写昵称");
        return;
      }
      setMatesInput(names.join(", "));
      persistAndGo(
        names,
        parsedLimit(),
        gameMode.trim(),
        rangeMode,
        pickedDate,
      );
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "识别失败");
    } finally {
      setSuggesting(false);
    }
  }

  function switchRange(next: SquadRangeMode) {
    setRangeMode(next);
    if (next === "today") setPickedDate(shanghaiDateKey(0));
    if (next === "yesterday") setPickedDate(shanghaiDateKey(-1));
    const mates = splitMates(matesInput);
    if (mates.length === 0) return;
    const pick =
      next === "today"
        ? shanghaiDateKey(0)
        : next === "yesterday"
          ? shanghaiDateKey(-1)
          : pickedDate;
    persistAndGo(mates, parsedLimit(), gameMode.trim(), next, pick);
  }

  function onPickDate(value: string) {
    setPickedDate(value);
    setRangeMode("pick");
    const mates = splitMates(matesInput);
    if (mates.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    persistAndGo(mates, parsedLimit(), gameMode.trim(), "pick", value);
  }

  const rangeHint =
    rangeMode === "hours24"
      ? "近 24h：滚动时间窗内四人齐全同场；与「今日」自然日不同；候选扫描最多 32 场。"
      : rangeMode === "today"
        ? "今日：北京时间自然日 00:00–24:00（半开）；候选扫描最多 32 场。"
        : rangeMode === "yesterday"
          ? "昨日：北京时间上一自然日；候选扫描最多 32 场。"
          : rangeMode === "pick"
            ? "选日：按所选北京时间自然日统计；候选扫描最多 32 场。"
            : "近 N 场：按扫描场次统计齐全同场。识别会扫描近况同队频率；队友写入浏览器本地缓存。";

  const chipClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${
      active
        ? "bg-accent-muted text-accent ring-1 ring-accent/50"
        : "border border-border-strong text-fg-secondary hover:border-border-strong"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchRange("matches")}
          className={chipClass(rangeMode === "matches")}
        >
          近 N 场
        </button>
        <button
          type="button"
          onClick={() => switchRange("hours24")}
          className={chipClass(rangeMode === "hours24")}
        >
          近 24 小时
        </button>
        <button
          type="button"
          onClick={() => switchRange("today")}
          className={chipClass(rangeMode === "today")}
        >
          今日
        </button>
        <button
          type="button"
          onClick={() => switchRange("yesterday")}
          className={chipClass(rangeMode === "yesterday")}
        >
          昨日
        </button>
        <button
          type="button"
          onClick={() => switchRange("pick")}
          className={chipClass(rangeMode === "pick")}
        >
          选日
        </button>
        {rangeMode === "pick" ? (
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => onPickDate(e.target.value)}
            className="rounded-lg border border-border-strong bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
        ) : null}
      </div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm text-fg-secondary">
          <span>队友昵称（最多 3 人，逗号分隔）</span>
          <input
            value={matesInput}
            onChange={(e) => setMatesInput(e.target.value)}
            placeholder="例如 MateA, MateB, MateC"
            className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-fg"
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-sm text-fg-secondary">
          <span>{isWindowMode ? "扫描上限" : "扫描场次"}</span>
          <input
            type="number"
            min={1}
            max={32}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-fg"
          />
        </label>
        <label className="flex w-36 flex-col gap-1 text-sm text-fg-secondary">
          <span>模式</span>
          <input
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value)}
            placeholder="空=全部；squad 含 fpp"
            list="squad-game-modes"
            className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-fg"
          />
          <datalist id="squad-game-modes">
            <option value="squad" />
            <option value="squad-fpp" />
            <option value="duo" />
            <option value="duo-fpp" />
          </datalist>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          统计
        </button>
        <button
          type="button"
          onClick={onSuggest}
          disabled={suggesting}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg hover:border-border-strong disabled:opacity-50"
        >
          {suggesting ? "识别中…" : "识别常一起的人"}
        </button>
      </form>
      {suggestError ? (
        <p className="text-sm text-danger">{suggestError}</p>
      ) : (
        <p className="text-xs text-muted">{rangeHint}</p>
      )}
    </div>
  );
}

function Bar({
  value,
  max,
  color = "bg-accent",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}

function SampleCards({
  sample,
  mates,
}: {
  sample: SquadSampleMeta;
  mates: { accountId: string; name: string }[];
}) {
  const missingLines = mates.map((m) => {
    const n = sample.missingByMate[m.accountId] ?? 0;
    return `${m.name} 缺席 ${n}`;
  });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniKpi label="已扫描" value={String(sample.scanned)} />
        <MiniKpi label="齐全场次" value={String(sample.fullSquad)} />
        <MiniKpi label="齐全率" value={formatPercent(sample.fullRate)} />
        <MiniKpi
          label="缺席合计"
          value={String(
            Object.values(sample.missingByMate).reduce((a, b) => a + b, 0),
          )}
        />
      </div>
      {missingLines.length > 0 ? (
        <p className="text-xs text-muted">
          缺席（已扫场中未同队）：{missingLines.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function PerPlayerTable({ rows }: { rows: SquadMemberStats[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="px-2 py-2 font-medium">玩家</th>
            <th className="px-2 py-2 font-medium">场次</th>
            <th className="px-2 py-2 font-medium">击杀</th>
            <th className="px-2 py-2 font-medium">助攻</th>
            <th className="px-2 py-2 font-medium">伤害</th>
            <th className="px-2 py-2 font-medium">场均存活</th>
            <th className="px-2 py-2 font-medium">均排</th>
            <th className="px-2 py-2 font-medium">Top10</th>
            <th className="px-2 py-2 font-medium">吃鸡</th>
            <th className="px-2 py-2 font-medium">伤占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} className="border-t border-border">
              <td className="px-2 py-2 text-fg">{r.name}</td>
              <td className="px-2 py-2">{r.games}</td>
              <td className="px-2 py-2">{r.kills}</td>
              <td className="px-2 py-2">{r.assists}</td>
              <td className="px-2 py-2">{formatNumber(r.damage, 0)}</td>
              <td className="px-2 py-2">{formatDuration(r.survival)}</td>
              <td className="px-2 py-2">
                {r.avgRank == null ? "-" : formatNumber(r.avgRank, 1)}
              </td>
              <td className="px-2 py-2">{formatPercent(r.top10Rate)}</td>
              <td className="px-2 py-2">{r.wins}</td>
              <td className="px-2 py-2">{formatPercent(r.dmgShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DamageShareBars({ rows }: { rows: SquadMemberStats[] }) {
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.dmgShare ?? 0));
  const colors = [
    "bg-accent/80",
    "bg-sky-500/80",
    "bg-success",
    "bg-violet-500/80",
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-fg-secondary">伤害占比</h3>
      {rows.map((r, i) => (
        <div key={r.accountId} className="space-y-1">
          <div className="flex justify-between text-xs text-fg-secondary">
            <span>{r.name}</span>
            <span>{formatPercent(r.dmgShare)}</span>
          </div>
          <Bar
            value={r.dmgShare ?? 0}
            max={maxShare}
            color={colors[i % colors.length]}
          />
        </div>
      ))}
    </div>
  );
}

function FullSquadMatches({
  matches,
  platform,
  accountId,
  name,
}: {
  matches: SquadMatchRow[];
  platform: string;
  accountId: string;
  name: string;
}) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted">
        暂无四人齐全对局。可调大扫描场次、换模式，或先同步近况写入历史库。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="px-2 py-2 font-medium">时间</th>
            <th className="px-2 py-2 font-medium">地图</th>
            <th className="px-2 py-2 font-medium">模式</th>
            <th className="px-2 py-2 font-medium">排名</th>
            <th className="px-2 py-2 font-medium">击杀合计</th>
            <th className="px-2 py-2 font-medium">伤害合计</th>
            <th className="px-2 py-2 font-medium">成员</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const kills = m.players.reduce((s, p) => s + p.kills, 0);
            const damage = m.players.reduce((s, p) => s + p.damage, 0);
            return (
              <tr
                key={m.matchId}
                className="border-t border-border hover:bg-surface-2"
              >
                <td className="px-2 py-2">
                  <Link
                    href={`/match/${m.matchId}?platform=${platform}&accountId=${encodeURIComponent(accountId)}&name=${encodeURIComponent(name)}`}
                    className="text-accent hover:underline"
                  >
                    {formatDateTime(m.playedAt)}
                  </Link>
                </td>
                <td className="px-2 py-2">{m.mapLabel}</td>
                <td className="px-2 py-2">
                  <GameModeChips gameMode={m.gameMode} size="sm" />
                </td>
                <td className={`px-2 py-2 font-medium ${rankClass(m.teamRank)}`}>
                  {m.teamRank == null ? "-" : `#${m.teamRank}`}
                </td>
                <td className="px-2 py-2">{kills}</td>
                <td className="px-2 py-2">{formatNumber(damage, 0)}</td>
                <td className="px-2 py-2 text-xs text-fg-secondary">
                  {m.players
                    .map((p) => `${p.name}(${p.kills}/${formatNumber(p.damage, 0)})`)
                    .join(" · ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SquadTabPanel({
  platform,
  name,
  accountId,
  mates,
  limit,
  gameMode,
  hours,
  date,
  tz,
  stats,
  error,
}: {
  platform: string;
  name: string;
  accountId: string;
  mates: string[];
  limit: number;
  gameMode: string;
  hours?: number | null;
  date?: string | null;
  tz?: string | null;
  stats: SquadStatsResult | null;
  error?: string;
}) {
  const mateNames = useMemo(
    () => stats?.mates.map((m) => m.name) ?? mates,
    [stats, mates],
  );
  const effectiveDate = date ?? stats?.date ?? null;
  const effectiveHours = effectiveDate
    ? null
    : (hours ?? (stats?.label === "rolling" ? stats.hours : null) ?? null);
  const effectiveTz = tz ?? stats?.tz ?? null;
  const rangeMode = resolveRangeMode(effectiveHours, effectiveDate);

  return (
    <div className="space-y-5">
      <SquadMatesForm
        key={`${(mateNames.length ? mateNames : mates).join(",")}|${limit}|${gameMode}|${effectiveHours ?? ""}|${effectiveDate ?? ""}`}
        platform={platform}
        name={name}
        accountId={accountId}
        initialMates={mateNames.length ? mateNames : mates}
        initialLimit={limit}
        initialGameMode={gameMode}
        initialHours={effectiveHours}
        initialDate={effectiveDate}
        initialTz={effectiveTz}
      />

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!mates.length && !error ? (
        <p className="text-sm text-muted">
          填写最多 3 名队友昵称，或点「识别常一起的人」后查看同场统计。
        </p>
      ) : null}

      {stats ? (
        <>
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg-secondary">
              {sampleTitle(stats, rangeMode)}
            </h3>
            <SampleCards sample={stats.sample} mates={stats.mates} />
            <p className="mt-2 text-xs text-muted">
              {stats.since && stats.until
                ? `${formatDateTime(stats.since)} — ${formatDateTime(stats.until)}${
                    stats.label === "calendar_day" || stats.date
                      ? " · 北京时间"
                      : ""
                  } · `
                : ""}
              limit={stats.limit}
              {stats.gameMode ? ` · gameMode=${stats.gameMode}` : ""} · 齐全场{" "}
              {stats.sample.fullSquad} / 扫描 {stats.sample.scanned}
            </p>
            {stats.insights?.length ? (
              <ul className="mt-3 space-y-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg-secondary">
                {stats.insights.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-accent">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-fg-secondary">
              四人对比（齐全场）
            </h3>
            <PerPlayerTable rows={stats.perPlayer} />
          </div>

          <DamageShareBars rows={stats.perPlayer} />

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-fg-secondary">
                齐全对局
                <span className="ml-2 text-xs font-normal text-muted">
                  {stats.matches.length} 场
                </span>
              </h3>
              <ExportSquadCsv
                platform={platform}
                playerName={name}
                matches={stats.matches}
                perPlayer={stats.perPlayer}
              />
            </div>
            <FullSquadMatches
              matches={stats.matches}
              platform={platform}
              accountId={accountId}
              name={name}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
