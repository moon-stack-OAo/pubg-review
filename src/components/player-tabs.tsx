import Link from "next/link";
import type {ComparePlayerSide, MapAggRow, WeaponsTabData,} from "@/lib/history/types";
import type {FormStatusCode, FormStatusResult,} from "@/lib/analysis/form-status";
import type {WeaknessTagSummary} from "@/lib/analysis/player-analysis-core";
import {formatNumber, formatPercent} from "@/lib/format";
import {gameModeLabel} from "@/lib/game-mode";
import {CompareForm} from "@/components/compare-form";

const FORM_CHIP_TONE: Record<FormStatusCode, string> = {
  normal: "border-success/40 bg-success-muted text-success",
  soft: "border-warning/40 bg-warning-muted text-warning",
  poor: "border-danger/40 bg-danger-muted text-danger",
};

export type PlayerTabId =
  | "overview"
  | "analysis"
  | "weapons"
  | "maps"
  | "compare"
  | "squad";

export function buildPlayerHref(
  platform: string,
  name: string,
  opts: {
    gameMode?: string;
    seasonId?: string;
    tag?: string;
    map?: string;
    tab?: string;
    vs?: string;
    mates?: string;
    limit?: string;
    hours?: string;
    date?: string;
    tz?: string;
    sort?: string;
    page?: string | number;
  },
): string {
  const q = new URLSearchParams();
  if (opts.gameMode) q.set("gameMode", opts.gameMode);
  if (opts.seasonId) q.set("seasonId", opts.seasonId);
  if (opts.tag) q.set("tag", opts.tag);
  if (opts.map) q.set("map", opts.map);
  if (opts.tab) q.set("tab", opts.tab);
  if (opts.vs) q.set("vs", opts.vs);
  if (opts.mates) q.set("mates", opts.mates);
  if (opts.limit) q.set("limit", opts.limit);
  if (opts.hours) q.set("hours", opts.hours);
  if (opts.date) q.set("date", opts.date);
  if (opts.tz) q.set("tz", opts.tz);
  if (opts.sort && opts.sort !== "time") q.set("sort", opts.sort);
  const pageNum =
    opts.page == null || opts.page === ""
      ? 1
      : Number(opts.page);
  if (Number.isFinite(pageNum) && pageNum > 1) {
    q.set("page", String(Math.floor(pageNum)));
  }
  const qs = q.toString();
  return `/player/${platform}/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
}

export function parsePlayerTab(raw: string): PlayerTabId {
  if (
    raw === "analysis" ||
    raw === "weapons" ||
    raw === "maps" ||
    raw === "compare" ||
    raw === "squad"
  ) {
    return raw;
  }
  return "overview";
}

export function PlayerTabNav({
  platform,
  name,
  tab,
  gameMode,
  seasonId,
  tag,
  vs,
  mates,
  limit,
  hours,
  date,
  tz,
}: {
  platform: string;
  name: string;
  tab: PlayerTabId;
  gameMode?: string;
  seasonId?: string;
  tag?: string;
  vs?: string;
  mates?: string;
  limit?: string;
  hours?: string;
  date?: string;
  tz?: string;
}) {
  const items: { id: PlayerTabId; label: string }[] = [
    { id: "overview", label: "概览" },
    { id: "analysis", label: "分析" },
    { id: "weapons", label: "武器" },
    { id: "maps", label: "地图" },
    { id: "compare", label: "对比" },
    { id: "squad", label: "车队" },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {items.map((item) => {
        const active = tab === item.id;
        return (
          <Link
            key={item.id}
            href={buildPlayerHref(platform, name, {
              gameMode,
              seasonId: item.id === "squad" ? undefined : seasonId,
              tag: item.id === "overview" ? tag : undefined,
              tab: item.id === "overview" ? undefined : item.id,
              vs: item.id === "compare" ? vs : undefined,
              mates: item.id === "squad" ? mates : undefined,
              limit: item.id === "squad" ? limit : undefined,
              hours: item.id === "squad" ? hours : undefined,
              date: item.id === "squad" ? date : undefined,
              tz: item.id === "squad" ? tz : undefined,
            })}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
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

export function WeaponsTabPanel({
  data,
  platform,
  name,
}: {
  data: WeaponsTabData;
  platform?: string;
  name?: string;
}) {
  const maxWeapon = Math.max(
    1,
    ...data.weapons.map((w) => w.kills + w.knocks),
  );
  const overviewHref =
    platform && name
      ? buildPlayerHref(platform, name, { tab: "overview" })
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-secondary">
        遥测解析进度：{data.parsedCount} / {data.sampleSize}
      </p>
      <p className="text-sm text-muted">{data.note}</p>

      {data.sampleSize === 0 && overviewHref ? (
        <p className="text-sm text-fg-secondary">
          <Link href={overviewHref} className="text-rank-1 hover:underline">
            前往概览同步近况
          </Link>
          ，写入本地历史后再查看武器统计。
        </p>
      ) : null}

      {data.sampleSize > 0 && data.parsedCount === 0 ? (
        <p className="text-sm text-fg-secondary">
          {overviewHref ? (
            <>
              可先到{" "}
              <Link href={overviewHref} className="text-rank-1 hover:underline">
                概览
              </Link>
              打开近期对局的事件轴/回放以触发自动解析，然后再回本 Tab。
            </>
          ) : (
            "打开近期对局的事件轴/回放以触发自动解析，然后再回本 Tab。"
          )}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniKpi label="样本场次" value={String(data.combat.matches)} />
        <MiniKpi
          label="场均击杀"
          value={formatNumber(data.combat.avgKills, 2)}
        />
        <MiniKpi
          label="场均伤害"
          value={formatNumber(data.combat.avgDamage, 0)}
        />
        <MiniKpi
          label="爆头击杀率"
          value={formatPercent(data.combat.headshotRate)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-fg-secondary md:grid-cols-4">
        <span>总击杀 {data.combat.kills}</span>
        <span>总助攻 {data.combat.assists}</span>
        <span>总伤害 {formatNumber(data.combat.damage, 0)}</span>
        <span>爆头击杀 {data.combat.headshotKills}</span>
      </div>

      {data.weapons.length === 0 ? (
        <p className="text-sm text-muted">
          暂无按武器明细。可在对局详情触发 telemetry 解析后再回来查看。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">武器</th>
                <th className="px-2 py-2 font-medium">击杀</th>
                <th className="px-2 py-2 font-medium">倒地</th>
                <th className="px-2 py-2 font-medium w-40">占比</th>
              </tr>
            </thead>
            <tbody>
              {data.weapons.map((w) => (
                <tr
                  key={w.weaponId}
                  className="border-t border-border"
                >
                  <td className="px-2 py-2 text-fg">{w.label}</td>
                  <td className="px-2 py-2">{w.kills}</td>
                  <td className="px-2 py-2">{w.knocks}</td>
                  <td className="px-2 py-2">
                    <Bar value={w.kills + w.knocks} max={maxWeapon} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MapsTabPanel({
  rows,
  sampleSize,
  gameModeFilter,
  platform,
  name,
  gameMode,
}: {
  rows: MapAggRow[];
  sampleSize: number;
  gameModeFilter: string | null;
  platform?: string;
  name?: string;
  gameMode?: string;
}) {
  const maxMatches = Math.max(1, ...rows.map((r) => r.matches));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        基于本地历史库近 {sampleSize} 场
        {gameModeFilter ? ` · 模式 ${gameModeLabel(gameModeFilter)}` : " · 全部模式"}
        。KD≈ 为近似值，非官方赛季 KD。
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          历史库暂无数据。打开概览或点击「同步近况」写入对局。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">地图</th>
                <th className="px-2 py-2 font-medium">场次</th>
                <th className="px-2 py-2 font-medium">平均排名</th>
                <th className="px-2 py-2 font-medium">KD≈</th>
                <th className="px-2 py-2 font-medium">场均伤</th>
                <th className="px-2 py-2 font-medium">吃鸡率</th>
                <th className="px-2 py-2 font-medium w-28">场次条</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href =
                  platform && name
                    ? buildPlayerHref(platform, name, {
                        gameMode: gameMode || undefined,
                        map: r.mapName,
                        tab: "overview",
                      })
                    : null;
                return (
                  <tr key={r.mapName} className="border-t border-border">
                    <td className="px-2 py-2 text-fg">
                      {href ? (
                        <Link
                          href={href}
                          className="text-accent hover:underline"
                        >
                          {r.mapLabel}
                        </Link>
                      ) : (
                        r.mapLabel
                      )}
                    </td>
                    <td className="px-2 py-2">{r.matches}</td>
                    <td className="px-2 py-2">
                      {r.avgRank == null ? "-" : formatNumber(r.avgRank, 1)}
                    </td>
                    <td className="px-2 py-2">
                      {formatNumber(r.kdApprox, 2)}
                    </td>
                    <td className="px-2 py-2">
                      {formatNumber(r.avgDamage, 0)}
                    </td>
                    <td className="px-2 py-2">{formatPercent(r.winRate)}</td>
                    <td className="px-2 py-2">
                      <Bar
                        value={r.matches}
                        max={maxMatches}
                        color="bg-success"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const COMPARE_METRICS: {
  key: keyof ComparePlayerSide["kpi"];
  label: string;
  higherBetter: boolean;
  format: (v: number | null) => string;
}[] = [
  { key: "kd", label: "KD", higherBetter: true, format: (v) => formatNumber(v, 2) },
  {
    key: "winRate",
    label: "胜率",
    higherBetter: true,
    format: (v) => formatPercent(v),
  },
  {
    key: "avgDamage",
    label: "场均伤害",
    higherBetter: true,
    format: (v) => formatNumber(v, 0),
  },
  {
    key: "roundsPlayed",
    label: "场次",
    higherBetter: true,
    format: (v) => (v == null ? "-" : String(v)),
  },
  {
    key: "top10Rate",
    label: "Top10",
    higherBetter: true,
    format: (v) => formatPercent(v),
  },
];

function ReadonlyWeaknessPills({ tags }: { tags: WeaknessTagSummary[] }) {
  if (tags.length === 0) {
    return <p className="text-xs text-muted">暂无明显弱点</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t.code}
          className="rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-xs text-fg-secondary"
        >
          {t.label}
          <span className="ml-1 opacity-70">×{t.count}</span>
        </span>
      ))}
    </div>
  );
}

function CompareSideFormBlock({
  sideName,
  form,
  weakness,
  formUnavailable,
}: {
  sideName: string;
  form: FormStatusResult | null;
  weakness: WeaknessTagSummary[];
  formUnavailable?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="mb-2 truncate text-xs text-muted">{sideName}</p>
      {formUnavailable || !form ? (
        <p className="text-sm text-muted">近况暂不可用</p>
      ) : (
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${FORM_CHIP_TONE[form.status]}`}
        >
          {form.label}
        </span>
      )}
      <div className="mt-2">
        <p className="mb-1 text-xs text-muted">弱点</p>
        <ReadonlyWeaknessPills tags={weakness} />
      </div>
    </div>
  );
}

export function CompareTabPanel({
  platform,
  name,
  gameMode,
  seasonId,
  vs,
  left,
  right,
  error,
  leftForm,
  rightForm,
  leftWeakness,
  rightWeakness,
  leftFormUnavailable,
  rightFormUnavailable,
}: {
  platform: string;
  name: string;
  gameMode?: string;
  seasonId?: string;
  vs?: string;
  left: ComparePlayerSide | null;
  right: ComparePlayerSide | null;
  error?: string;
  leftForm?: FormStatusResult | null;
  rightForm?: FormStatusResult | null;
  leftWeakness?: WeaknessTagSummary[];
  rightWeakness?: WeaknessTagSummary[];
  leftFormUnavailable?: boolean;
  rightFormUnavailable?: boolean;
}) {
  const maxByKey: Record<string, number> = {};
  if (left && right) {
    for (const m of COMPARE_METRICS) {
      const a = left.kpi[m.key] ?? 0;
      const b = right.kpi[m.key] ?? 0;
      maxByKey[m.key] = Math.max(Number(a), Number(b), 0.0001);
    }
  }

  return (
    <div className="space-y-4">
      <CompareForm
        platform={platform}
        name={name}
        gameMode={gameMode}
        seasonId={seasonId}
        otherName={vs}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {left && right ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CompareSideFormBlock
              sideName={left.name}
              form={leftForm ?? null}
              weakness={leftWeakness ?? []}
              formUnavailable={leftFormUnavailable}
            />
            <CompareSideFormBlock
              sideName={right.name}
              form={rightForm ?? null}
              weakness={rightWeakness ?? []}
              formUnavailable={rightFormUnavailable}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">指标</th>
                  <th className="px-2 py-2 font-medium">{left.name}</th>
                  <th className="px-2 py-2 font-medium">对比</th>
                  <th className="px-2 py-2 font-medium">{right.name}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_METRICS.map((m) => {
                  const lv = left.kpi[m.key];
                  const rv = right.kpi[m.key];
                  const max = maxByKey[m.key] ?? 1;
                  return (
                    <tr key={m.key} className="border-t border-border">
                      <td className="px-2 py-3 text-fg-secondary">{m.label}</td>
                      <td className="px-2 py-3 font-medium text-fg">
                        {m.format(lv as number | null)}
                        <div className="mt-1">
                          <Bar
                            value={Number(lv ?? 0)}
                            max={max}
                            color="bg-accent/80"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-muted">vs</td>
                      <td className="px-2 py-3 font-medium text-fg">
                        {m.format(rv as number | null)}
                        <div className="mt-1">
                          <Bar
                            value={Number(rv ?? 0)}
                            max={max}
                            color="bg-sky-500/80"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              模式：{left.gameMode ?? "-"} / {right.gameMode ?? "-"} ·
              数据来自赛季统计（非历史库场次聚合）
            </p>
          </div>
        </>
      ) : (
        !error && (
          <p className="text-sm text-muted">
            输入另一位同平台玩家昵称开始对比（最多 2 人）。
          </p>
        )
      )}
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
