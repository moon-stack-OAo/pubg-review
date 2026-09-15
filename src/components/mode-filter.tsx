"use client";

import {useRouter} from "next/navigation";
import {Chip, GameModeChips, cn} from "@/components/ui";

type ModeOption = {
  gameMode: string;
  roundsPlayed: number;
};

export function ModeFilter({
  platform,
  name,
  current,
  seasonId,
  tag,
  map,
  tab,
  vs,
  sort,
  options,
}: {
  platform: string;
  name: string;
  current: string;
  seasonId?: string;
  tag?: string;
  map?: string;
  tab?: string;
  vs?: string;
  sort?: string;
  options: ModeOption[];
}) {
  const router = useRouter();

  function go(next: string) {
    const q = new URLSearchParams();
    if (next) q.set("gameMode", next);
    if (seasonId) q.set("seasonId", seasonId);
    if (tag) q.set("tag", tag);
    if (map) q.set("map", map);
    if (tab) q.set("tab", tab);
    if (vs) q.set("vs", vs);
    if (sort && sort !== "time") q.set("sort", sort);
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}${q.toString() ? `?${q}` : ""}`,
    );
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Chip as="button" type="button" active={!current} onClick={() => go("")}>
        默认（场次最多）
      </Chip>
      {options.map((m) => {
        const selected = current === m.gameMode;
        return (
          <button
            key={m.gameMode}
            type="button"
            onClick={() => go(m.gameMode)}
            title={m.gameMode}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full p-0.5 transition-[box-shadow,background] hover:bg-surface-hover/60",
              selected &&
                "bg-accent-muted/40 ring-1 ring-accent/60 ring-offset-1 ring-offset-bg",
            )}
          >
            <GameModeChips gameMode={m.gameMode} size="sm" />
            <span className="pr-1.5 text-xs text-muted">· {m.roundsPlayed}</span>
          </button>
        );
      })}
    </div>
  );
}
