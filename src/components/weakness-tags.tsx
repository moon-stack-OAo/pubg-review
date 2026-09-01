import Link from "next/link";
import type {PlayerRadar, WeaknessTagSummary,} from "@/lib/analysis/player-analysis-core";
import {buildPlayerHref} from "@/components/player-tabs";

export function WeaknessTagChips({
  tags,
  platform,
  name,
  activeTag,
  gameMode,
  seasonId,
  map,
  sort,
}: {
  tags: WeaknessTagSummary[];
  platform: string;
  name: string;
  activeTag?: string;
  gameMode?: string;
  seasonId?: string;
  map?: string;
  sort?: string;
}) {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        近期对局暂无明显弱点标签（或样本不足）。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const active = activeTag === t.code;
        return (
          <Link
            key={t.code}
            href={buildPlayerHref(platform, name, {
              gameMode,
              seasonId,
              map,
              sort,
              tag: active ? undefined : t.code,
            })}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active
                ? "border-rose-500/50 bg-rose-500/20 text-rose-200"
                : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-rose-500/40 hover:text-rose-200"
            }`}
            title={`点击${active ? "清除" : "按"}「${t.label}」过滤近期对局`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">×{t.count}</span>
          </Link>
        );
      })}
      {activeTag ? (
        <Link
          href={buildPlayerHref(platform, name, {
            gameMode,
            seasonId,
            map,
            sort,
          })}
          className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-500 hover:text-zinc-300"
        >
          清除过滤
        </Link>
      ) : null}
    </div>
  );
}

const RADAR_LABELS: { key: keyof PlayerRadar; label: string }[] = [
  { key: "survival", label: "生存节奏" },
  { key: "aim", label: "枪感输出" },
  { key: "landing", label: "落点选择" },
  { key: "endgame", label: "决赛圈" },
  { key: "teamplay", label: "团队贡献" },
];

export function RadarBars({ radar }: { radar: PlayerRadar }) {
  return (
    <div className="space-y-3">
      {RADAR_LABELS.map(({ key, label }) => {
        const value = radar[key];
        return (
          <div key={key}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-zinc-400">{label}</span>
              <span className="font-medium tabular-nums text-zinc-200">
                {value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600/80 to-amber-400"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
