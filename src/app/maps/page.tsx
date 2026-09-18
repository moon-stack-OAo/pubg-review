import type {Metadata} from "next";
import {MapCatalogCard} from "@/components/map-catalog-card";
import {AppTopbar, PageShell} from "@/components/ui";
import {listMaps} from "@/lib/pubg/maps";

export const metadata: Metadata = {
  title: "地图中心 · PUBG Review",
  description: "PUBG 地图资料、官方底图与遥测坐标尺寸。",
};

export default function MapsPage() {
  const maps = listMaps();

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="地图中心" />
      <PageShell>
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-accent">
              Battleground Atlas
            </p>
            <h1 className="mt-1 text-3xl font-semibold">地图中心</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg-secondary">
              PUBG 主要地图的官方底图、遥测坐标尺寸与 API 标识。
            </p>
          </div>
          <span className="font-mono text-sm text-muted">{maps.length} MAPS</span>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {maps.map((map) => (
            <MapCatalogCard key={map.id} map={map} />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
          <span>底图使用官方 Low Res 资源，本地静态提供。</span>
          <a
            href="https://github.com/pubg/api-assets/tree/master/Assets/Maps"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            PUBG API Assets
          </a>
        </div>
      </PageShell>
    </div>
  );
}
