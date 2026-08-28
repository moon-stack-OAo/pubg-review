"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ExportSquadCsv} from "@/components/export-squad-csv";
import {formatDateTime, formatDuration, formatNumber, formatPercent, rankClass,} from "@/lib/format";
import {readSquadMates, writeSquadMates,} from "@/lib/squad-mates-storage";
import type {SquadMatchRow, SquadMemberStats, SquadSampleMeta, SquadStatsResult,} from "@/lib/squad/types";

const DEFAULT_LIMIT = 20;
/** 空=不过滤模式（兼容 squad / squad-fpp） */
const DEFAULT_GAME_MODE = "";
const MAX_MATES = 3;

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T | null;
};

function splitMates(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_MATES);
}

function buildSquadHref(
  platform: string,
  name: string,
  opts: { mates: string[]; limit: number; gameMode: string },
): string {
  const q = new URLSearchParams();
  q.set("tab", "squad");
  if (opts.mates.length) q.set("mates", opts.mates.join(","));
  if (opts.limit !== DEFAULT_LIMIT) q.set("limit", String(opts.limit));
  if (opts.gameMode) q.set("gameMode", opts.gameMode);
  return `/player/${platform}/${encodeURIComponent(name)}?${q.toString()}`;
}

export function SquadMatesForm({
  platform,
  name,
  accountId,
  initialMates,
  initialLimit,
  initialGameMode,
}: {
  platform: string;
  name: string;
  accountId: string;
  initialMates: string[];
  initialLimit: number;
  initialGameMode: string;
}) {
  const router = useRouter();
  const playerKey = accountId || name;
  const [matesInput, setMatesInput] = useState(initialMates.join(", "));
  const [limit, setLimit] = useState(String(initialLimit || DEFAULT_LIMIT));
  const [gameMode, setGameMode] = useState(initialGameMode);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const hydratedRef = useRef(false);

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
      }),
    );
  }, [
    initialMates,
    initialLimit,
    initialGameMode,
    playerKey,
    platform,
    name,
    router,
  ]);

  const persistAndGo = useCallback(
    (mates: string[], nextLimit: number, nextMode: string) => {
      writeSquadMates(playerKey, {
        mates,
        limit: nextLimit,
        gameMode: nextMode,
      });
      router.push(
        buildSquadHref(platform, name, {
          mates,
          limit: nextLimit,
          gameMode: nextMode,
        }),
      );
    },
    [playerKey, platform, name, router],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mates = splitMates(matesInput);
    if (mates.length === 0) {
      setSuggestError("请至少填写 1 名队友昵称");
      return;
    }
    setSuggestError("");
    const lim = Number(limit);
    const nextLimit =
      Number.isFinite(lim) && lim > 0
        ? Math.min(Math.floor(lim), 32)
        : DEFAULT_LIMIT;
    const nextMode = gameMode.trim();
    persistAndGo(mates, nextLimit, nextMode);
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
      const lim = Number(limit);
      const nextLimit =
        Number.isFinite(lim) && lim > 0
          ? Math.min(Math.floor(lim), 32)
          : DEFAULT_LIMIT;
      const nextMode = gameMode.trim();
      persistAndGo(names, nextLimit, nextMode);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "识别失败");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm text-zinc-400">
          <span>队友昵称（最多 3 人，逗号分隔）</span>
          <input
            value={matesInput}
            onChange={(e) => setMatesInput(e.target.value)}
            placeholder="例如 MateA, MateB, MateC"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-sm text-zinc-400">
          <span>扫描场次</span>
          <input
            type="number"
            min={1}
            max={32}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
          />
        </label>
        <label className="flex w-36 flex-col gap-1 text-sm text-zinc-400">
          <span>模式</span>
          <input
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value)}
            placeholder="空=全部；squad 含 fpp"
            list="squad-game-modes"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
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
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400"
        >
          统计
        </button>
        <button
          type="button"
          onClick={onSuggest}
          disabled={suggesting}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
        >
          {suggesting ? "识别中…" : "识别常一起的人"}
        </button>
      </form>
      {suggestError ? (
        <p className="text-sm text-rose-300">{suggestError}</p>
      ) : (
        <p className="text-xs text-zinc-600">
          识别会扫描近况同队频率；统计在服务端直接聚合，不受 BFF IP
          限流影响。队友会按本玩家写入浏览器本地缓存。
        </p>
      )}
    </div>
  );
}

function Bar({
  value,
  max,
  color = "bg-amber-500",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
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
        <p className="text-xs text-zinc-500">
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
        <thead className="text-zinc-500">
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
            <tr key={r.accountId} className="border-t border-zinc-800/80">
              <td className="px-2 py-2 text-zinc-200">{r.name}</td>
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
    "bg-amber-500/80",
    "bg-sky-500/80",
    "bg-emerald-500/80",
    "bg-violet-500/80",
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-zinc-300">伤害占比</h3>
      {rows.map((r, i) => (
        <div key={r.accountId} className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
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
      <p className="text-sm text-zinc-500">
        暂无四人齐全对局。可调大扫描场次、换模式，或先同步近况写入历史库。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-zinc-500">
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
                className="border-t border-zinc-800/80 hover:bg-zinc-900/50"
              >
                <td className="px-2 py-2">
                  <Link
                    href={`/match/${m.matchId}?platform=${platform}&accountId=${encodeURIComponent(accountId)}&name=${encodeURIComponent(name)}`}
                    className="text-amber-300 hover:underline"
                  >
                    {formatDateTime(m.playedAt)}
                  </Link>
                </td>
                <td className="px-2 py-2">{m.mapLabel}</td>
                <td className="px-2 py-2">{m.gameMode}</td>
                <td className={`px-2 py-2 font-medium ${rankClass(m.teamRank)}`}>
                  {m.teamRank == null ? "-" : `#${m.teamRank}`}
                </td>
                <td className="px-2 py-2">{kills}</td>
                <td className="px-2 py-2">{formatNumber(damage, 0)}</td>
                <td className="px-2 py-2 text-xs text-zinc-400">
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
  stats,
  error,
}: {
  platform: string;
  name: string;
  accountId: string;
  mates: string[];
  limit: number;
  gameMode: string;
  stats: SquadStatsResult | null;
  error?: string;
}) {
  const mateNames = useMemo(
    () => stats?.mates.map((m) => m.name) ?? mates,
    [stats, mates],
  );

  return (
    <div className="space-y-5">
      <SquadMatesForm
        key={`${(mateNames.length ? mateNames : mates).join(",")}|${limit}|${gameMode}`}
        platform={platform}
        name={name}
        accountId={accountId}
        initialMates={mateNames.length ? mateNames : mates}
        initialLimit={limit}
        initialGameMode={gameMode}
      />

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!mates.length && !error ? (
        <p className="text-sm text-zinc-500">
          填写最多 3 名队友昵称，或点「识别常一起的人」后查看同场统计。
        </p>
      ) : null}

      {stats ? (
        <>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">样本</h3>
            <SampleCards sample={stats.sample} mates={stats.mates} />
            <p className="mt-2 text-xs text-zinc-600">
              limit={stats.limit}
              {stats.gameMode ? ` · gameMode=${stats.gameMode}` : ""} · 齐全场{" "}
              {stats.sample.fullSquad} / 扫描 {stats.sample.scanned}
            </p>
            {stats.insights?.length ? (
              <ul className="mt-3 space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300">
                {stats.insights.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-amber-500/80">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">
              四人对比（齐全场）
            </h3>
            <PerPlayerTable rows={stats.perPlayer} />
          </div>

          <DamageShareBars rows={stats.perPlayer} />

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-zinc-300">
                齐全对局
                <span className="ml-2 text-xs font-normal text-zinc-500">
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
