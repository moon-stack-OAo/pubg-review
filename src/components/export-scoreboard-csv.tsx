"use client";

import {useCallback} from "react";
import type {PubgRoster} from "@/lib/pubg/types";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function ExportScoreboardCsv({
  matchId,
  mapLabel,
  gameMode,
  playedAt,
  rosters,
}: {
  matchId: string;
  mapLabel: string;
  gameMode: string;
  playedAt: string;
  rosters: PubgRoster[];
}) {
  const onClick = useCallback(() => {
    const header = [
      "teamRank",
      "name",
      "accountId",
      "kills",
      "assists",
      "damageDealt",
      "survivalTimeSec",
      "revives",
      "dbnos",
      "headshotKills",
      "winPlace",
    ];
    const lines = [header.join(",")];
    for (const roster of rosters) {
      for (const p of roster.participants) {
        lines.push(
          [
            csvEscape(roster.teamRank),
            csvEscape(p.name),
            csvEscape(p.accountId),
            csvEscape(p.kills),
            csvEscape(p.assists),
            csvEscape(Math.round(p.damageDealt)),
            csvEscape(Math.round(p.survivalTimeSec)),
            csvEscape(p.revives),
            csvEscape(p.dbnos),
            csvEscape(p.headshotKills),
            csvEscape(p.winPlace),
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
    a.download = `pubg-${matchId}-${mapLabel}-${gameMode}.csv`.replace(
      /[^\w.\-]+/g,
      "_",
    );
    a.click();
    URL.revokeObjectURL(url);
  }, [gameMode, mapLabel, matchId, rosters]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-accent-border hover:text-accent"
      title={`导出积分板 CSV · ${playedAt}`}
    >
      导出 CSV
    </button>
  );
}
