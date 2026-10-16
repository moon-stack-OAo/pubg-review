"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";
import {getRecentSeasons, getSeasonLabel, normalizeSeasons, seasonMatchesPlatform} from "@/lib/pubg/seasons";

export type SeasonOption = {
  id: string;
  label: string;
  isCurrent: boolean;
};

export function SeasonSelect({
  platform,
  name,
  currentSeasonId,
  gameMode,
  tag,
  map,
  tab,
  vs,
  sort,
  options,
}: {
  platform: string;
  name: string;
  currentSeasonId: string;
  gameMode?: string;
  tag?: string;
  map?: string;
  tab?: string;
  vs?: string;
  sort?: string;
  options: SeasonOption[];
}) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const normalized = normalizeSeasons(options, platform);
  const recent = getRecentSeasons(normalized);
  const visible = [...(showHistory ? normalized : recent)];
  const selectedSeasonId = seasonMatchesPlatform(currentSeasonId, platform)
    ? currentSeasonId : normalized[0]?.id || "";
  if (selectedSeasonId && !visible.some((season) => season.id === selectedSeasonId)) {
    visible.push(normalized.find((season) => season.id === selectedSeasonId) ?? {
      id: selectedSeasonId,
      label: getSeasonLabel(selectedSeasonId),
      isCurrent: false,
    });
  }
  const hasHistory = normalized.some((season) => !recent.some((item) => item.id === season.id));

  function onChange(nextSeasonId: string) {
    const q = new URLSearchParams();
    if (gameMode) q.set("gameMode", gameMode);
    if (tag) q.set("tag", tag);
    if (map) q.set("map", map);
    if (tab) q.set("tab", tab);
    if (vs) q.set("vs", vs);
    if (sort && sort !== "time") q.set("sort", sort);
    // 当前赛季不写 query，保持 URL 简洁；切换赛季清 page
    const current = normalized.find((s) => s.isCurrent);
    if (nextSeasonId && (!current || nextSeasonId !== current.id)) {
      q.set("seasonId", nextSeasonId);
    }
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}${q.toString() ? `?${q}` : ""}`,
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
      <label className="inline-flex items-center gap-2">
        <span>赛季</span>
        <select
          value={selectedSeasonId}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[16rem] rounded-lg border border-border-strong bg-surface-2 px-2 py-1 text-fg"
        >
          {visible.map((season) => (
            <option key={season.id} value={season.id}>
              {season.label}
              {season.isCurrent ? "（当前）" : ""}
            </option>
          ))}
        </select>
      </label>
      {hasHistory ? (
        <button
          type="button"
          aria-pressed={showHistory}
          onClick={() => setShowHistory((shown) => !shown)}
          className="text-xs text-accent hover:underline"
        >
          {showHistory ? "收起历史赛季" : "查看全部历史赛季"}
        </button>
      ) : null}
    </div>
  );
}
