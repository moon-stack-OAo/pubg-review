"use client";

import {useCallback} from "react";
import type {SquadMatchRow, SquadMemberStats} from "@/lib/squad/types";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function playerCol(match: SquadMatchRow, index: number, field: "name" | "kills" | "damage") {
  const p = match.players[index];
  if (!p) return "";
  if (field === "name") return p.name;
  if (field === "kills") return p.kills;
  return Math.round(p.damage);
}

export function ExportSquadCsv({
  platform,
  playerName,
  matches,
  perPlayer,
}: {
  platform: string;
  playerName: string;
  matches: SquadMatchRow[];
  perPlayer: SquadMemberStats[];
}) {
  const onClick = useCallback(() => {
    const maxSlots = Math.max(4, ...matches.map((m) => m.players.length), 0);
    const memberHeaders: string[] = [];
    for (let i = 1; i <= maxSlots; i += 1) {
      memberHeaders.push(`p${i}_name`, `p${i}_kills`, `p${i}_damage`);
    }

    const header = [
      "matchId",
      "playedAt",
      "map",
      "gameMode",
      "teamRank",
      ...memberHeaders,
    ];
    const lines = [header.join(",")];

    for (const m of matches) {
      const cols: (string | number)[] = [
        csvEscape(m.matchId),
        csvEscape(m.playedAt),
        csvEscape(m.mapLabel),
        csvEscape(m.gameMode),
        csvEscape(m.teamRank),
      ];
      for (let i = 0; i < maxSlots; i += 1) {
        cols.push(
          csvEscape(playerCol(m, i, "name")),
          csvEscape(playerCol(m, i, "kills")),
          csvEscape(playerCol(m, i, "damage")),
        );
      }
      lines.push(cols.join(","));
    }

    // 可选：同一文件追加人均汇总 section
    if (perPlayer.length > 0) {
      lines.push("");
      lines.push("# per_player_summary");
      lines.push(
        [
          "name",
          "accountId",
          "games",
          "kills",
          "assists",
          "damage",
          "avgRank",
          "top10Rate",
          "wins",
          "dmgShare",
        ].join(","),
      );
      for (const r of perPlayer) {
        lines.push(
          [
            csvEscape(r.name),
            csvEscape(r.accountId),
            csvEscape(r.games),
            csvEscape(r.kills),
            csvEscape(r.assists),
            csvEscape(Math.round(r.damage)),
            csvEscape(r.avgRank),
            csvEscape(r.top10Rate),
            csvEscape(r.wins),
            csvEscape(r.dmgShare),
          ].join(","),
        );
      }
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download =
      `pubg-squad-${platform}-${playerName}-${stamp}.csv`.replace(
        /[^\w.\-]+/g,
        "_",
      );
    a.click();
    URL.revokeObjectURL(url);
  }, [matches, perPlayer, platform, playerName]);

  if (matches.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-200"
      title="导出齐全对局明细 CSV（含人均汇总）"
    >
      导出 CSV
    </button>
  );
}
