"use client";

import {useMemo, useState} from "react";
import type {PlayerTrend, TrendPoint} from "@/lib/history/trend";

type Metric = "kd" | "avgDamage" | "avgRank";

const METRICS: { key: Metric; label: string; invert?: boolean }[] = [
  { key: "kd", label: "KD" },
  { key: "avgDamage", label: "场均伤害" },
  { key: "avgRank", label: "平均排名", invert: true },
];

function metricValue(p: TrendPoint, key: Metric): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function TrendChart({ trend }: { trend: PlayerTrend }) {
  const [metric, setMetric] = useState<Metric>("kd");
  const points = trend.points;

  const series = useMemo(() => {
    return points.map((p) => ({
      date: p.date,
      value: metricValue(p, metric),
    }));
  }, [points, metric]);

  const values = series.map((s) => s.value).filter((v): v is number => v != null);
  const hasData = values.length > 0;

  const min = hasData ? Math.min(...values) : 0;
  const max = hasData ? Math.max(...values) : 1;
  const span = max - min || 1;
  const invert = METRICS.find((m) => m.key === metric)?.invert === true;

  const w = 560;
  const h = 140;
  const padX = 8;
  const padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const coords = series.map((s, i) => {
    const x =
      series.length <= 1
        ? padX + innerW / 2
        : padX + (i / (series.length - 1)) * innerW;
    if (s.value == null) return { x, y: null as number | null, date: s.date, value: null };
    const norm = (s.value - min) / span;
    const y = invert
      ? padY + norm * innerH
      : padY + (1 - norm) * innerH;
    return { x, y, date: s.date, value: s.value };
  });

  const pathD = coords
    .filter((c) => c.y != null)
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${(c.y as number).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-fg-secondary">
          近 14 天趋势
          <span className="ml-2 text-xs font-normal text-muted">
            按日聚合 · 官方近况 + 本地历史
          </span>
        </h3>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`rounded-md px-2.5 py-1 transition ${
                metric === m.key
                  ? "bg-accent-muted text-accent"
                  : "text-fg-secondary hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted">近 14 天暂无可用对局数据，同步近况后可生成趋势。</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-36 w-full text-accent"
            role="img"
            aria-label={`近14天${METRICS.find((m) => m.key === metric)?.label}趋势`}
          >
            <line
              x1={padX}
              y1={padY + innerH}
              x2={padX + innerW}
              y2={padY + innerH}
              stroke="currentColor"
              strokeOpacity={0.15}
            />
            {pathD ? (
              <path
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {coords.map((c) =>
              c.y == null ? null : (
                <circle
                  key={c.date}
                  cx={c.x}
                  cy={c.y}
                  r={3}
                  fill="#0a0a0a"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <title>{`${c.date}: ${c.value}`}</title>
                </circle>
              ),
            )}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{series[0]?.date}</span>
            <span>
              {min.toFixed(metric === "kd" ? 2 : 0)} –{" "}
              {max.toFixed(metric === "kd" ? 2 : 0)}
            </span>
            <span>{series[series.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}
