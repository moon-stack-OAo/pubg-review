"use client";

import {useCallback, useSyncExternalStore} from "react";
import {isFavorite, subscribeFavorites, toggleFavorite} from "@/lib/favorites";
import type {PubgPlatform} from "@/lib/pubg/types";
import {buttonClass} from "@/components/ui";

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
      className={buttonClass(favorited ? "soft" : "secondary", "md")}
      aria-pressed={favorited}
    >
      {favorited ? "★ 已收藏" : "☆ 收藏"}
    </button>
  );
}
