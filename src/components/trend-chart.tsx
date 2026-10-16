"use client";

import {useMemo, useState} from "react";
import type {PlayerTrend, TrendPoint} from "@/lib/history/trend";

type Metric = "kd" | "avgDamage" | "avgRank";

const METRICS: { key: Metric; label: string; invert?: boolean }[] = [
  { key: "kd", label: "KD≈" },
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
  const span = max - min;
  const selectedMetric = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const invert = selectedMetric.invert === true;
  const hasAnyData = points.some((point) => METRICS.some((item) => metricValue(point, item.key) != null));
  const formatValue = (value: number) => value.toFixed(metric === "kd" ? 2 : 1);

  const w = 560;
  const h = 180;
  const padX = 52;
  const padY = 16;
  const innerW = w - padX - 12;
  const innerH = h - padY - 28;
  const valueY = (value: number) => {
    const norm = span === 0 ? 0.5 : (value - min) / span;
    return padY + (invert ? norm : 1 - norm) * innerH;
  };

  const coords = series.map((s, i) => {
    const x =
      series.length <= 1
        ? padX + innerW / 2
        : padX + (i / (series.length - 1)) * innerW;
    if (s.value == null) return { x, y: null as number | null, date: s.date, value: null };
    return { x, y: valueY(s.value), date: s.date, value: s.value };
  });

  const pathD = coords.map((point, index) => {
    if (point.y == null) return "";
    const command = index > 0 && coords[index - 1].y != null ? "L" : "M";
    return `${command} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
  const ticks = span === 0 ? [min] : [min, (min + max) / 2, max];
  const dateTicks = Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]))
    .filter((index) => index >= 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-fg-secondary">
          近 14 天趋势
          <span className="ml-2 text-xs font-normal text-muted">
            上海日历日 · 官方近况 + 本地历史
          </span>
        </h3>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
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
        <p className="text-sm text-muted">
          {hasAnyData
            ? `近 14 天暂无可用${selectedMetric.label}数据，可切换其他指标。`
            : "近 14 天暂无已同步对局数据，同步近况后可生成趋势。"}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-auto w-full text-accent"
            role="img"
            aria-label={`近14天${selectedMetric.label}趋势（上海日期${invert ? "，排名越靠上越好" : ""}）`}
          >
            {ticks.map((value) => (
              <g key={value}>
                <line
                  x1={padX}
                  y1={valueY(value)}
                  x2={padX + innerW}
                  y2={valueY(value)}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                />
                <text
                  x={padX - 8}
                  y={valueY(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  className="fill-muted"
                >
                  {formatValue(value)}
                </text>
              </g>
            ))}
            {dateTicks.map((index) => (
              <text
                key={index}
                x={coords[index].x}
                y={h - 7}
                textAnchor={series.length === 1 ? "middle" : index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}
                fontSize={10}
                className="fill-muted"
              >
                {series[index].date.slice(5).replace("-", "/")}
              </text>
            ))}
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
            {coords.map((point) => (
              <g key={point.date}>
                <title>{`${point.date}（上海） · ${selectedMetric.label}：${point.value == null ? "暂无已同步数据" : formatValue(point.value)}`}</title>
                <rect
                  x={point.x - 10}
                  y={padY - 4}
                  width={20}
                  height={innerH + 8}
                  fill="transparent"
                />
                {point.y == null ? null : (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    className="fill-surface-2"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            ))}
          </svg>
          <p className="mt-1 text-xs text-muted">
            空白日期表示暂无已同步数据，不计为 0；{invert ? "排名越靠上越好。" : "悬停数据点可查看日期和数值。"}
          </p>
          <table className="sr-only">
            <caption>近 14 天{selectedMetric.label}，按上海日历日聚合</caption>
            <thead><tr><th scope="col">日期</th><th scope="col">{selectedMetric.label}</th></tr></thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.date}</th>
                  <td>{point.value == null ? "暂无已同步数据" : formatValue(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {metric === "kd" ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          KD≈ = 当日击杀数 ÷ 已知排名大于 1 的场次；分母为 0 时使用击杀数，仅为近似统计，非官方赛季 KD。
        </p>
      ) : null}
    </div>
  );
}
