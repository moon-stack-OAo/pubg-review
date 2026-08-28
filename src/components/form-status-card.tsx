import Link from "next/link";
import {Card} from "@/components/ui";
import {buildPlayerHref} from "@/components/player-tabs";
import type {AnomalyItem, FormStatusCode, PlayerFormAnalysis,} from "@/lib/analysis/form-status";
import {formatDateTime, formatNumber} from "@/lib/format";

const STATUS_TONE: Record<
  FormStatusCode,
  { card: string; score: string; chip: string }
> = {
  normal: {
    card: "border-emerald-800/60 bg-emerald-950/20",
    score: "text-emerald-300",
    chip: "border-emerald-700/50 bg-emerald-900/40 text-emerald-200",
  },
  soft: {
    card: "border-amber-800/60 bg-amber-950/20",
    score: "text-amber-300",
    chip: "border-amber-700/50 bg-amber-900/40 text-amber-200",
  },
  poor: {
    card: "border-rose-800/60 bg-rose-950/20",
    score: "text-rose-300",
    chip: "border-rose-700/50 bg-rose-900/40 text-rose-200",
  },
};

function matchHref(
  matchId: string,
  platform: string,
  accountId: string,
  name: string,
): string {
  const q = new URLSearchParams({
    platform,
    accountId,
    name,
  });
  return `/match/${matchId}?${q}`;
}

function AnomalyRow({
  item,
  platform,
  accountId,
  name,
  gameMode,
  seasonId,
}: {
  item: AnomalyItem;
  platform: string;
  accountId: string;
  name: string;
  gameMode?: string;
  seasonId?: string;
}) {
  if (item.type === "tag_streak") {
    const tagHref = buildPlayerHref(platform, name, {
      gameMode,
      seasonId,
      tag: item.tagCode,
    });
    const firstMatchId = item.matchIds[0];
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
        <span>
          连续 {item.count} 场「{item.tagLabel}」
        </span>
        <span className="flex flex-wrap gap-3 text-xs">
          <Link href={tagHref} className="text-amber-300 hover:underline">
            按标签过滤
          </Link>
          {firstMatchId ? (
            <Link
              href={matchHref(firstMatchId, platform, accountId, name)}
              className="text-zinc-400 hover:text-amber-300 hover:underline"
            >
              首场对局
            </Link>
          ) : null}
        </span>
      </li>
    );
  }

  const label =
    item.type === "low_damage"
      ? `低伤离群：${formatNumber(item.damage, 0)}（近场均值 ${formatNumber(item.avgDamage, 0)} · ${Math.round(item.ratio * 100)}%）`
      : `低击杀离群：${item.kills}（近场均值 ${formatNumber(item.avgKills, 1)} · ${Math.round(item.ratio * 100)}%）`;

  const meta = [item.mapLabel, item.playedAt ? formatDateTime(item.playedAt) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
      <span>
        {label}
        {meta ? (
          <span className="ml-2 text-xs text-zinc-500">{meta}</span>
        ) : null}
      </span>
      <Link
        href={matchHref(item.matchId, platform, accountId, name)}
        className="text-xs text-amber-300 hover:underline"
      >
        查看对局
      </Link>
    </li>
  );
}

export function FormStatusCard({
  analysis,
  error,
  platform,
  accountId,
  name,
  gameMode,
  seasonId,
}: {
  analysis: PlayerFormAnalysis | null;
  error?: string;
  platform: string;
  accountId: string;
  name: string;
  gameMode?: string;
  seasonId?: string;
}) {
  if (error || !analysis) {
    return (
      <Card>
        <p className="text-sm font-medium text-zinc-300">近况现状</p>
        <p className="mt-2 text-sm text-zinc-500">
          {error
            ? `近况分析暂不可用：${error}`
            : "近况分析暂不可用，请稍后重试。"}
        </p>
      </Card>
    );
  }

  const { form, anomalies, overallScore } = analysis;
  const tone = STATUS_TONE[form.status];

  return (
    <Card className={tone.card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">近况现状</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            {overallScore != null ? (
              <span className={`text-3xl font-semibold tracking-tight ${tone.score}`}>
                {overallScore}
              </span>
            ) : null}
            <span className={`text-xl font-semibold tracking-tight ${tone.score}`}>
              {form.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{form.summary}</p>
        </div>
        <p className="text-xs text-zinc-500">
          近 {form.recent.sampleSize} 场样本
        </p>
      </div>

      {form.needImprove.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">需提升</span>
          {form.needImprove.map((item) => (
            <span
              key={item}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${tone.chip}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {form.season &&
      (form.season.avgDamage != null || form.season.kd != null) ? (
        <p className="mt-3 text-xs text-zinc-500">
          赛季伤 {formatNumber(form.season.avgDamage, 0)} / KD{" "}
          {formatNumber(form.season.kd, 2)}
          <span className="mx-1.5 text-zinc-700">vs</span>
          近 {form.recent.sampleSize} 场伤{" "}
          {formatNumber(form.recent.avgDamage, 0)} / KD{" "}
          {formatNumber(form.recent.kd, 2)}
        </p>
      ) : null}

      <div className="mt-4 border-t border-zinc-800/80 pt-3">
        <h3 className="mb-2 text-sm font-medium text-zinc-300">异常</h3>
        {anomalies.length === 0 ? (
          <p className="text-sm text-zinc-500">
            近样本未检出相对自身的明显异常
          </p>
        ) : (
          <ul className="space-y-2">
            {anomalies.map((item, i) => (
              <AnomalyRow
                key={
                  item.type === "tag_streak"
                    ? `streak-${item.tagCode}-${i}`
                    : `${item.type}-${item.matchId}-${i}`
                }
                item={item}
                platform={platform}
                accountId={accountId}
                name={name}
                gameMode={gameMode}
                seasonId={seasonId}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
