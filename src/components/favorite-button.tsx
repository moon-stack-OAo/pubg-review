"use client";

import {useCallback, useSyncExternalStore} from "react";
import {isFavorite, subscribeFavorites, toggleFavorite,} from "@/lib/favorites";
import type {PubgPlatform} from "@/lib/pubg/types";

const FAVORITE_SERVER_SNAPSHOT = false;

export function FavoriteButton({
  accountId,
  platform,
  name,
}: {
  accountId: string;
  platform: PubgPlatform;
  name: string;
}) {
  const favorited = useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(accountId, platform),
    () => FAVORITE_SERVER_SNAPSHOT,
  );

  const onClick = useCallback(() => {
    toggleFavorite({ accountId, platform, name });
  }, [accountId, platform, name]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        favorited
          ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
      aria-pressed={favorited}
    >
      {favorited ? "已收藏" : "收藏"}
    </button>
  );
}
