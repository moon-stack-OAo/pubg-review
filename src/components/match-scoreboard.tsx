"use client";

import {useMemo, useState} from "react";
import {formatDuration, formatNumber, rankClass} from "@/lib/format";
import type {PubgRoster} from "@/lib/pubg/types";

export function MatchScoreboard({
  rosters,
  accountId,
}: {
  rosters: PubgRoster[];
  accountId: string;
}) {
  const [onlyMyTeam, setOnlyMyTeam] = useState(false);

  const myRosterId = useMemo(() => {
    if (!accountId) return null;
    return (
      rosters.find((r) => r.participants.some((p) => p.accountId === accountId))
        ?.id ?? null
    );
  }, [rosters, accountId]);

  const visible = onlyMyTeam && myRosterId
    ? rosters.filter((r) => r.id === myRosterId)
    : rosters;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">积分板</h2>
        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={onlyMyTeam}
            onChange={(e) => setOnlyMyTeam(e.target.checked)}
            disabled={!myRosterId}
          />
          仅我的队伍
        </label>
      </div>

      <div className="space-y-4">
        {visible.map((roster) => (
          <div
            key={roster.id}
            className="overflow-x-auto rounded-lg border border-border"
          >
            <div className="border-b border-border bg-surface-2 px-3 py-2 text-sm text-fg-secondary">
              队伍排名{" "}
              <span className={rankClass(roster.teamRank)}>
                {roster.teamRank == null ? "-" : `#${roster.teamRank}`}
              </span>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">玩家</th>
                  <th className="px-3 py-2 font-medium">击杀</th>
                  <th className="px-3 py-2 font-medium">助攻</th>
                  <th className="px-3 py-2 font-medium">伤害</th>
                  <th className="px-3 py-2 font-medium">存活</th>
                  <th className="px-3 py-2 font-medium">救援</th>
                </tr>
              </thead>
              <tbody>
                {roster.participants.map((p) => {
                  const isMe = Boolean(accountId && p.accountId === accountId);
                  return (
                    <tr
                      key={`${roster.id}-${p.accountId ?? p.name}`}
                      className={`border-t border-border ${
                        isMe ? "bg-accent-muted" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        {p.name}
                        {isMe ? (
                          <span className="ml-2 text-xs text-accent">我</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums">{p.kills}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{p.assists}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{formatNumber(p.damageDealt, 0)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">
                        {formatDuration(p.survivalTimeSec)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums">{p.revives}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
