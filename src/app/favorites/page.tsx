"use client";

import Link from "next/link";
import {useCallback, useSyncExternalStore} from "react";
import {FavoritesSyncPanel} from "@/components/favorites-sync-panel";
import {AppTopbar, Card, PageShell, buttonClass} from "@/components/ui";
import {
  type FavoritePlayer,
  getFavoritesServerSnapshot,
  readFavorites,
  removeFavorite,
  subscribeFavorites,
} from "@/lib/favorites";

function FavoritesList({ items }: { items: FavoritePlayer[] }) {
  const onRemove = useCallback((item: FavoritePlayer) => {
    removeFavorite(item.accountId, item.platform);
  }, []);

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          暂无收藏。在玩家页点击「收藏」即可加入本机列表（localStorage）。
        </p>
      </Card>
    );
  }

  return <FavoritesSyncPanel items={items} onRemove={onRemove} />;
}

export default function FavoritesPage() {
  const items = useSyncExternalStore(
    subscribeFavorites,
    readFavorites,
    getFavoritesServerSnapshot,
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar
        right={
          <Link href="/" className={buttonClass("ghost", "sm")}>
            返回搜索
          </Link>
        }
      />
      <PageShell>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-muted">
              Favorites
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              收藏玩家
            </h1>
            <p className="text-sm text-muted">共 {items.length} 人 · 设备本地</p>
          </div>
        </div>
        <FavoritesList items={items} />
      </PageShell>
    </div>
  );
}
