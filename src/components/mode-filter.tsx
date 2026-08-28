"use client";

import {useRouter} from "next/navigation";

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
  tab,
  vs,
  options,
}: {
  platform: string;
  name: string;
  current: string;
  seasonId?: string;
  tag?: string;
  tab?: string;
  vs?: string;
  options: ModeOption[];
}) {
  const router = useRouter();

  function go(next: string) {
    const q = new URLSearchParams();
    if (next) q.set("gameMode", next);
    if (seasonId) q.set("seasonId", seasonId);
    if (tag) q.set("tag", tag);
    if (tab) q.set("tab", tab);
    if (vs) q.set("vs", vs);
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}${q.toString() ? `?${q}` : ""}`,
    );
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => go("")}
        className={`rounded-full px-3 py-1 text-sm ${
          !current
            ? "bg-amber-500 text-black"
            : "border border-zinc-700 text-zinc-300"
        }`}
      >
        默认（场次最多）
      </button>
      {options.map((m) => (
        <button
          key={m.gameMode}
          type="button"
          onClick={() => go(m.gameMode)}
          className={`rounded-full px-3 py-1 text-sm ${
            current === m.gameMode
              ? "bg-amber-500 text-black"
              : "border border-zinc-700 text-zinc-300"
          }`}
        >
          {m.gameMode} · {m.roundsPlayed}
        </button>
      ))}
    </div>
  );
}
