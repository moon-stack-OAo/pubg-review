"use client";

import Image from "next/image";
import {useMemo, useState} from "react";
import {Chip, cn} from "@/components/ui";
import {
  listPoiKindsPresent,
  poiKindLabel,
  type MapPoi,
  type MapPoiKind,
} from "@/lib/pubg/map-pois";

type Props = {
  mapName: string;
  image: string;
  assetFile: string;
  sizeCm: number;
  pois: readonly MapPoi[];
};

const KIND_DOT: Record<MapPoiKind, string> = {
  hotspot: "bg-accent border-accent-border",
  building: "bg-info border-info/60",
  compound: "bg-warning border-warning/50",
  secret_room: "bg-[var(--mode-squad)] border-[color-mix(in_oklch,var(--mode-squad)_70%,transparent)]",
  vehicle_zone: "bg-success border-success/50",
};

const KIND_BOUNDS: Record<MapPoiKind, string> = {
  hotspot: "border-accent/40 bg-accent/10",
  building: "border-info/40 bg-info/10",
  compound: "border-warning/35 bg-warning/10",
  secret_room:
    "border-[color-mix(in_oklch,var(--mode-squad)_40%,transparent)] bg-[color-mix(in_oklch,var(--mode-squad)_12%,transparent)]",
  vehicle_zone: "border-success/35 bg-success/10",
};

/** 与 match-replay toCanvas 同约定：x→水平、y→垂直向下，无翻转 */
function toPercent(value: number, sizeCm: number): number {
  return (value / sizeCm) * 100;
}

export function MapPoiViewer({
  mapName,
  image,
  assetFile,
  sizeCm,
  pois,
}: Props) {
  const kinds = useMemo(() => listPoiKindsPresent(pois), [pois]);
  const [enabled, setEnabled] = useState<Record<MapPoiKind, boolean>>(() => {
    const init = {} as Record<MapPoiKind, boolean>;
    for (const k of kinds) init[k] = true;
    return init;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(
    () => pois.filter((p) => enabled[p.kind] !== false),
    [pois, enabled],
  );

  const selected = selectedId
    ? (pois.find((p) => p.id === selectedId) ?? null)
    : null;

  function toggleKind(kind: MapPoiKind) {
    setEnabled((prev) => ({...prev, [kind]: !prev[kind]}));
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-xs leading-relaxed text-warning">
        点位为自维护 / 社区清单近似，非游戏内房间还原；官方遥测无稳定房间
        ID。地堡入口坐标来自社区图鉴换算，版本更新后可能偏移，仅供地图中心参考。
      </p>

      {kinds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">图层</span>
          {kinds.map((kind) => (
            <Chip
              key={kind}
              as="button"
              type="button"
              tone="neutral"
              active={enabled[kind] !== false}
              onClick={() => toggleKind(kind)}
              aria-pressed={enabled[kind] !== false}
            >
              {poiKindLabel(kind)}
            </Chip>
          ))}
        </div>
      ) : null}

      <figure className="overflow-hidden rounded-lg border border-border bg-black shadow-[var(--shadow-md)]">
        <div className="relative aspect-square w-full">
          <Image
            src={image}
            alt={`${mapName}官方地图底图`}
            width={1024}
            height={1024}
            priority
            className="h-full w-full object-cover"
          />

          {visible.map((poi) => {
            if (!poi.bounds) return null;
            const left = toPercent(poi.bounds.minX, sizeCm);
            const top = toPercent(poi.bounds.minY, sizeCm);
            const width = toPercent(poi.bounds.maxX - poi.bounds.minX, sizeCm);
            const height = toPercent(
              poi.bounds.maxY - poi.bounds.minY,
              sizeCm,
            );
            return (
              <button
                key={`${poi.id}-bounds`}
                type="button"
                title={poi.name}
                aria-label={`${poi.name} 范围`}
                onClick={() =>
                  setSelectedId((id) => (id === poi.id ? null : poi.id))
                }
                className={cn(
                  "absolute rounded-sm border border-dashed transition-opacity hover:opacity-100",
                  KIND_BOUNDS[poi.kind],
                  selectedId === poi.id
                    ? "opacity-100 ring-1 ring-accent"
                    : "opacity-70",
                )}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              />
            );
          })}

          {visible.map((poi) => {
            const left = toPercent(poi.x, sizeCm);
            const top = toPercent(poi.y, sizeCm);
            return (
              <button
                key={poi.id}
                type="button"
                title={`${poi.name}（${poiKindLabel(poi.kind)}）`}
                aria-label={poi.name}
                onClick={() =>
                  setSelectedId((id) => (id === poi.id ? null : poi.id))
                }
                className={cn(
                  "absolute z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm transition-transform hover:scale-125",
                  KIND_DOT[poi.kind],
                  selectedId === poi.id
                    ? "scale-125 ring-2 ring-white/70"
                    : null,
                )}
                style={{left: `${left}%`, top: `${top}%`}}
              />
            );
          })}
        </div>

        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-xs text-muted">
          <span>{assetFile}</span>
          <a
            href={`https://github.com/pubg/api-assets/blob/master/Assets/Maps/${assetFile}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            查看官方资源
          </a>
        </figcaption>
      </figure>

      {selected ? (
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{selected.name}</span>
            <Chip tone="neutral">{poiKindLabel(selected.kind)}</Chip>
          </div>
          <p className="mt-1 font-mono text-xs text-muted">
            x={selected.x.toLocaleString()} · y={selected.y.toLocaleString()}
            {" · "}近似坐标
          </p>
          {selected.note ? (
            <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
              {selected.note}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">点击点位查看名称与说明。</p>
      )}
    </div>
  );
}
