"use client";

import {useRouter} from "next/navigation";

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

  function onChange(nextSeasonId: string) {
    const q = new URLSearchParams();
    if (gameMode) q.set("gameMode", gameMode);
    if (tag) q.set("tag", tag);
    if (map) q.set("map", map);
    if (tab) q.set("tab", tab);
    if (vs) q.set("vs", vs);
    if (sort && sort !== "time") q.set("sort", sort);
    // 当前赛季不写 query，保持 URL 简洁；切换赛季清 page
    const current = options.find((s) => s.isCurrent);
    if (nextSeasonId && (!current || nextSeasonId !== current.id)) {
      q.set("seasonId", nextSeasonId);
    }
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}${q.toString() ? `?${q}` : ""}`,
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
      <span>赛季</span>
      <select
        value={currentSeasonId}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[16rem] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.isCurrent ? "（当前）" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
