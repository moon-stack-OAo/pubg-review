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
      <p className="text-sm text-muted">
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
                ? "border-tag-weakness/40 bg-tag-weakness-muted text-tag-weakness"
                : "border-border bg-surface-2 text-fg-secondary hover:border-tag-weakness/40 hover:text-tag-weakness"
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
          className="rounded-full border border-border-strong px-3 py-1 text-sm text-muted hover:text-fg-secondary"
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
              <span className="text-fg-secondary">{label}</span>
              <span className="font-medium tabular-nums text-fg">
                {value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
