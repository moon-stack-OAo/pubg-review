import Link from "next/link";
import {Card, GameModeChips, Kpi} from "@/components/ui";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  rankClass,
} from "@/lib/format";
import type {PlayerWindowStats} from "@/lib/history/types";

export function WindowStatsCard({
  stats,
  error,
  platform,
  accountId,
  name,
}: {
  stats: PlayerWindowStats | null;
  error?: string;
  platform: string;
  accountId: string;
  name: string;
}) {
  if (error) {
    return (
      <Card>
        <p className="text-sm font-medium text-fg-secondary">近 24 小时</p>
        <p className="mt-2 text-sm text-muted">加载失败：{error}</p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <p className="text-sm font-medium text-fg-secondary">近 24 小时</p>
        <p className="mt-2 text-sm text-muted">暂无时间窗数据。</p>
      </Card>
    );
  }

  const title =
    stats.hours === 24 ? "近 24 小时" : `近 ${stats.hours} 小时`;
  const { kpi, matches } = stats;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {formatDateTime(stats.since)} — {formatDateTime(stats.until)}
            {stats.gameModeFilter ? ` · ${stats.gameModeFilter}` : ""}
            {` · 本地库 ${stats.historyTotal} 场`}
          </p>
        </div>
        <span className="text-xs text-muted">{kpi.matches} 场样本</span>
      </div>

      {stats.emptyReason === "no_history" ? (
        <p className="text-sm text-muted">
          本地历史库暂无对局。请先点击右上角「同步近况」写入近期对局后再查看。
        </p>
      ) : stats.emptyReason === "no_matches_in_window" ? (
        <p className="text-sm text-muted">
          该时间窗内暂无对局
          {stats.historyTotal > 0
            ? `（本地库共 ${stats.historyTotal} 场，可能均在窗口外）`
            : ""}
          。可先同步近况，或稍后再看。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="KD" value={formatNumber(kpi.kd, 2)} />
            <Kpi label="胜率" value={formatPercent(kpi.winRate)} />
            <Kpi label="场均伤害" value={formatNumber(kpi.avgDamage, 0)} />
            <Kpi label="场均击杀" value={formatNumber(kpi.avgKills, 1)} />
            <Kpi label="场次" value={String(kpi.matches)} />
            <Kpi label="Top10" value={formatPercent(kpi.top10Rate)} />
          </div>

          {matches.length > 0 ? (
            <div className="mt-4 overflow-x-auto border-t border-border pt-3">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">时间</th>
                    <th className="px-2 py-2 font-medium">地图</th>
                    <th className="px-2 py-2 font-medium">模式</th>
                    <th className="px-2 py-2 font-medium">排名</th>
                    <th className="px-2 py-2 font-medium">击杀</th>
                    <th className="px-2 py-2 font-medium">伤害</th>
                    <th className="px-2 py-2 font-medium">存活</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(0, 12).map((m) => (
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
                      <td
                        className={`px-2 py-2 font-medium ${rankClass(m.rank)}`}
                      >
                        {m.rank == null ? "-" : `#${m.rank}`}
                      </td>
                      <td className="px-2 py-2">{m.kills}</td>
                      <td className="px-2 py-2">
                        {formatNumber(m.damage, 0)}
                      </td>
                      <td className="px-2 py-2">
                        {formatDuration(m.survivalTimeSec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matches.length > 12 ? (
                <p className="mt-2 text-xs text-muted">
                  仅展示最近 12 场，共 {matches.length} 场落在窗口内。
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
