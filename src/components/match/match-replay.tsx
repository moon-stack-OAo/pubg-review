"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {formatDuration} from "@/lib/format";
import {mapLabel, mapSizeCm} from "@/lib/pubg/maps";
import type {
    TelemetryEventsPayload,
    TelemetryGunline,
    TelemetryPosition,
    TelemetryStatus,
    TelemetryZone,
} from "@/lib/telemetry/types";

type Props = {
  matchId: string;
  platform: string;
  accountId?: string;
  initialT?: number;
};

type Layers = {
  trail: boolean;
  names: boolean;
  zones: boolean;
  gunlines: boolean;
};

/** 枪线淡出窗口（秒）：仅绘制 [t-FADE, t] 内线段 */
const GUNLINE_FADE_SEC = 2.5;
/** 事件高亮时间窗（秒）：|e.t - curT| <= 此值 */
const EVENT_HL_SEC = 1.0;
/** 跟随视角默认缩放 */
const FOLLOW_ZOOM = 2;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;

const SPEEDS = [1, 2, 4] as const;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function statusMessage(status: TelemetryStatus, err: string | null): string {
  if (status === "pending") return "遥测解析中，解析完成后即可回放";
  if (status === "expired") return err || "遥测已过期，无法回放";
  if (status === "failed") return err || "遥测解析失败，无法回放";
  if (status === "none") return err || "本场无遥测，无法回放";
  return "";
}

/** 取每个玩家在时刻 t 最近的位置（不晚于 t） */
function positionsAt(
  t: number,
  byPlayer: Map<string, TelemetryPosition[]>,
): Map<string, TelemetryPosition> {
  const out = new Map<string, TelemetryPosition>();
  for (const [id, list] of byPlayer) {
    let best: TelemetryPosition | null = null;
    for (const p of list) {
      if (p.t > t) break;
      best = p;
    }
    if (best) out.set(id, best);
  }
  return out;
}

function zoneAt(zones: TelemetryZone[], t: number, type: "safe" | "blue") {
  let best: TelemetryZone | null = null;
  for (const z of zones) {
    if (z.type !== type) continue;
    if (z.t > t) break;
    best = z;
  }
  return best;
}

function teamColor(teamId: number | null, focus: boolean): string {
  if (focus) return "#fbbf24";
  if (teamId == null) return "#a1a1aa";
  const hue = (teamId * 47) % 360;
  return `hsl(${hue} 70% 60%)`;
}

function drawGunlines(
  ctx: CanvasRenderingContext2D,
  gunlines: TelemetryGunline[],
  curT: number,
  toCanvas: (x: number, y: number) => { cx: number; cy: number },
  focusId?: string,
) {
  const t0 = curT - GUNLINE_FADE_SEC;
  for (const g of gunlines) {
    if (g.t > curT) break;
    if (g.t < t0) continue;
    const age = curT - g.t;
    const alpha = Math.max(0.12, 1 - age / GUNLINE_FADE_SEC);
    const focus =
      Boolean(focusId) &&
      (g.attackerId === focusId || g.victimId === focusId);
    const a = toCanvas(g.x1, g.y1);
    const b = toCanvas(g.x2, g.y2);
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    if (g.kind === "kill") {
      ctx.strokeStyle = `rgba(251,113,133,${alpha})`;
      ctx.lineWidth = focus ? 2 : 1.5;
    } else if (g.kind === "knock") {
      ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
      ctx.lineWidth = focus ? 1.8 : 1.3;
    } else {
      ctx.strokeStyle = focus
        ? `rgba(248,250,252,${alpha * 0.85})`
        : `rgba(161,161,170,${alpha * 0.55})`;
      ctx.lineWidth = focus ? 1.2 : 0.8;
    }
    ctx.stroke();
  }
}

export function MatchReplay({ matchId, platform, accountId, initialT }: Props) {
  const [data, setData] = useState<TelemetryEventsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [layers, setLayers] = useState<Layers>({
    trail: true,
    names: true,
    zones: true,
    gunlines: true,
  });
  const [follow, setFollow] = useState(() => Boolean(accountId));
  const [camZoom, setCamZoom] = useState(1);
  const [camCX, setCamCX] = useState<number | null>(null);
  const [camCY, setCamCY] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const durationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<(opts?: { forceParse?: boolean }) => Promise<void>>(
    async () => undefined,
  );
  const appliedInitialKeyRef = useRef<string | null>(null);
  const camZoomRef = useRef(1);
  const camCXRef = useRef<number | null>(null);
  const camCYRef = useRef<number | null>(null);
  const followRef = useRef(follow);
  const mapSizeRef = useRef(0);
  const gestureRef = useRef<{
    mode: "none" | "pan" | "pinch";
    pointerId: number | null;
    lastX: number;
    lastY: number;
    pinchStartDist: number;
    pinchStartZoom: number;
  }>({
    mode: "none",
    pointerId: null,
    lastX: 0,
    lastY: 0,
    pinchStartDist: 0,
    pinchStartZoom: 1,
  });
  const activePointersRef = useRef(
    new Map<number, { clientX: number; clientY: number }>(),
  );

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    camZoomRef.current = camZoom;
  }, [camZoom]);
  useEffect(() => {
    camCXRef.current = camCX;
  }, [camCX]);
  useEffect(() => {
    camCYRef.current = camCY;
  }, [camCY]);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  useEffect(() => {
    mapSizeRef.current = mapSizeCm(data?.mapName ?? "");
  }, [data?.mapName]);

  const load = useCallback(async (opts?: { forceParse?: boolean }) => {
    setError("");
    try {
      if (opts?.forceParse) {
        setParsing(true);
        await fetch(
          `/api/v1/matches/${encodeURIComponent(matchId)}/telemetry/parse?platform=${platform}`,
          { method: "POST" },
        );
      }
      const q = new URLSearchParams({ platform, sampleHz: "1" });
      if (accountId) q.set("accountId", accountId);
      const res = await fetch(
        `/api/v1/matches/${encodeURIComponent(matchId)}/telemetry/events?${q}`,
      );
      const body = (await res.json()) as {
        code: number;
        message: string;
        data: TelemetryEventsPayload | null;
      };
      if (body.code !== 0 || !body.data) {
        setError(body.message || "加载失败");
        setData(null);
        return;
      }
      setData(body.data);
      if (body.data.status === "pending") {
        pollRef.current = setTimeout(() => {
          void loadRef.current();
        }, 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setParsing(false);
    }
  }, [matchId, platform, accountId]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(boot);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [load]);

  const byPlayer = useMemo(() => {
    const map = new Map<string, TelemetryPosition[]>();
    if (!data) return map;
    for (const p of data.positions) {
      const list = map.get(p.accountId) ?? [];
      list.push(p);
      map.set(p.accountId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.t - b.t);
    }
    return map;
  }, [data]);

  const duration = data?.durationSec ?? 0;
  const mapSize = mapSizeCm(data?.mapName ?? "");

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!data || data.status !== "ready") return;
    if (initialT == null) return;
    const key = `${matchId}:${initialT}`;
    if (appliedInitialKeyRef.current === key) return;
    appliedInitialKeyRef.current = key;
    const clamped = Math.min(Math.max(initialT, 0), data.durationSec);
    setPlaying(false);
    setT(clamped);
  }, [data, initialT, matchId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const payload = data;
    if (!canvas || !payload || payload.status !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pad = 8;
    const size = Math.min(w, h) - pad * 2;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    const curT = tRef.current;
    const at = positionsAt(curT, byPlayer);

    let zoom = camZoom;
    let centerX = camCX ?? mapSize / 2;
    let centerY = camCY ?? mapSize / 2;
    if (follow && accountId) {
      const focusPos = at.get(accountId);
      if (focusPos) {
        zoom = Math.max(camZoom, FOLLOW_ZOOM);
        centerX = focusPos.x;
        centerY = focusPos.y;
      }
    }

    const toCanvas = (x: number, y: number) => ({
      cx: ox + size / 2 + ((x - centerX) / mapSize) * size * zoom,
      cy: oy + size / 2 + ((y - centerY) / mapSize) * size * zoom,
    });
    const toRadius = (r: number) => (r / mapSize) * size * zoom;

    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, size, size);

    if (layers.zones) {
      const blue = zoneAt(payload.zones, curT, "blue");
      const safe = zoneAt(payload.zones, curT, "safe");
      if (blue) {
        const { cx, cy } = toCanvas(blue.x, blue.y);
        const r = toRadius(blue.radius);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(59,130,246,0.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (safe) {
        const { cx, cy } = toCanvas(safe.x, safe.y);
        const r = toRadius(safe.radius);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (layers.trail && accountId) {
      const trail = byPlayer.get(accountId) ?? [];
      ctx.beginPath();
      let started = false;
      for (const p of trail) {
        if (p.t > curT) break;
        const { cx, cy } = toCanvas(p.x, p.y);
        if (!started) {
          ctx.moveTo(cx, cy);
          started = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      if (started) {
        ctx.strokeStyle = "rgba(251,191,36,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (layers.gunlines && payload.gunlines?.length) {
      drawGunlines(ctx, payload.gunlines, curT, toCanvas, accountId);
    }

    for (const e of payload.events) {
      if (e.type !== "kill" && e.type !== "knock") continue;
      if (e.x == null || e.y == null) continue;
      if (Math.abs(e.t - curT) > EVENT_HL_SEC) continue;
      const { cx, cy } = toCanvas(e.x, e.y);
      const age = Math.abs(e.t - curT);
      const alpha = Math.max(0.35, 1 - age / EVENT_HL_SEC);
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      if (e.type === "kill") {
        ctx.strokeStyle = `rgba(251,113,133,${alpha})`;
        ctx.fillStyle = `rgba(251,113,133,${alpha * 0.18})`;
      } else {
        ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
        ctx.fillStyle = `rgba(251,191,36,${alpha * 0.18})`;
      }
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }

    const nameById = new Map(payload.players.map((p) => [p.accountId, p]));

    for (const [id, pos] of at) {
      const player = nameById.get(id);
      const focus = Boolean(accountId && id === accountId);
      const { cx, cy } = toCanvas(pos.x, pos.y);
      const r = focus ? 5 : 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = teamColor(player?.teamId ?? null, focus);
      ctx.fill();
      if (focus) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (layers.names && (focus || (player?.teamId != null && accountId))) {
        const focusTeam = accountId
          ? nameById.get(accountId)?.teamId
          : null;
        const sameTeam =
          focus ||
          (focusTeam != null && player?.teamId === focusTeam);
        if (sameTeam || focus) {
          ctx.fillStyle = focus ? "#fde68a" : "#a1a1aa";
          ctx.font = "10px ui-sans-serif, system-ui";
          ctx.fillText(player?.name ?? id.slice(0, 6), cx + 6, cy - 4);
        }
      }
    }
  }, [data, mapSize, layers, accountId, byPlayer, follow, camZoom, camCX, camCY]);

  useEffect(() => {
    draw();
  }, [draw, t, layers, follow, camZoom, camCX, camCY]);

  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      const pts = activePointersRef.current;
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        gestureRef.current = {
          mode: "pinch",
          pointerId: null,
          lastX: 0,
          lastY: 0,
          pinchStartDist: pinchDistance(a, b),
          pinchStartZoom: camZoomRef.current,
        };
        setFollow(false);
        return;
      }
      if (pts.size === 1) {
        gestureRef.current = {
          mode: "pan",
          pointerId: e.pointerId,
          lastX: e.clientX,
          lastY: e.clientY,
          pinchStartDist: 0,
          pinchStartZoom: camZoomRef.current,
        };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    [],
  );

  const onCanvasPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      const g = gestureRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const mapSz = mapSizeRef.current || 1;
      const rect = canvas.getBoundingClientRect();
      const cssSize = Math.min(rect.width, rect.height) - 16;
      if (cssSize <= 0) return;

      if (g.mode === "pinch" && activePointersRef.current.size >= 2) {
        const [a, b] = Array.from(activePointersRef.current.values());
        const dist = pinchDistance(a, b);
        if (g.pinchStartDist > 0) {
          const next = clamp(
            g.pinchStartZoom * (dist / g.pinchStartDist),
            ZOOM_MIN,
            ZOOM_MAX,
          );
          camZoomRef.current = next;
          setCamZoom(next);
        }
        return;
      }

      if (g.mode === "pan" && g.pointerId === e.pointerId) {
        const dx = e.clientX - g.lastX;
        const dy = e.clientY - g.lastY;
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        if (followRef.current) setFollow(false);
        const zoom = camZoomRef.current;
        const worldPerPx = mapSz / (cssSize * zoom);
        const nextCX = clamp(
          (camCXRef.current ?? mapSz / 2) - dx * worldPerPx,
          0,
          mapSz,
        );
        const nextCY = clamp(
          (camCYRef.current ?? mapSz / 2) - dy * worldPerPx,
          0,
          mapSz,
        );
        camCXRef.current = nextCX;
        camCYRef.current = nextCY;
        setCamCX(nextCX);
        setCamCY(nextCY);
      }
    },
    [],
  );

  const endPointer = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (activePointersRef.current.size < 2 && gestureRef.current.mode === "pinch") {
      gestureRef.current.mode = "none";
    }
    if (activePointersRef.current.size === 0) {
      gestureRef.current.mode = "none";
      gestureRef.current.pointerId = null;
    }
  }, []);

  const onCanvasWheel = useCallback((e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const next = clamp(camZoomRef.current * factor, ZOOM_MIN, ZOOM_MAX);
    camZoomRef.current = next;
    setCamZoom(next);
    if (followRef.current) setFollow(false);
  }, []);

  const resetCamera = useCallback(() => {
    setCamZoom(1);
    setCamCX(null);
    setCamCY(null);
    camZoomRef.current = 1;
    camCXRef.current = null;
    camCYRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      if (!playingRef.current) return;
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const max = durationRef.current;
      let next = tRef.current + dt * speedRef.current;
      if (next >= max) {
        next = max;
        setPlaying(false);
      }
      tRef.current = next;
      setT(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [playing]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        加载回放数据…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger-muted p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!data || data.status !== "ready") {
    const msg = statusMessage(data?.status ?? "none", data?.errorMessage ?? null);
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-fg-secondary">{msg}</p>
        <p className="mt-2 text-xs text-muted">
          报告与积分板不受影响；可稍后重试解析。
        </p>
        <button
          type="button"
          disabled={parsing || data?.status === "pending"}
          onClick={() => void load({ forceParse: true })}
          className="mt-3 rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:border-accent-border disabled:opacity-50"
        >
          {data?.status === "pending" || parsing ? "解析中…" : "触发解析"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">2D 回放（MVP）</h2>
        <span className="text-xs text-muted">
          {mapLabel(data.mapName)} · 坐标粗归一 · 非官方贴图
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={640}
        height={640}
        aria-label="对局 2D 回放画布，可拖拽平移，双指捏合缩放"
        className="mx-auto max-h-[min(70vh,100vw)] w-full max-w-xl touch-none rounded-lg border border-border bg-black"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onCanvasWheel}
      />

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="min-h-[var(--touch-min)] rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:border-accent-border sm:min-h-0"
          >
            {playing ? "暂停" : "播放"}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`min-h-[var(--touch-min)] min-w-[2.5rem] rounded-md px-2 py-1 text-xs sm:min-h-0 ${
                speed === s
                  ? "bg-accent-muted text-accent"
                  : "bg-surface-2 text-fg-secondary"
              }`}
            >
              {s}x
            </button>
          ))}
          <button
            type="button"
            onClick={resetCamera}
            className="min-h-[var(--touch-min)] rounded-md border border-border px-2 py-1 text-xs text-fg-secondary hover:border-accent-border sm:min-h-0"
            title="重置视角"
          >
            重置视角
          </button>
          <span className="ml-auto font-mono text-xs text-fg-secondary">
            {formatDuration(Math.floor(t))} / {formatDuration(duration)}
            <span className="ml-2 text-muted">{camZoom.toFixed(1)}x</span>
          </span>
        </div>
        <p className="text-xs text-muted sm:hidden">
          单指拖拽平移 · 双指捏合缩放 · 拖动时会关闭跟随
        </p>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={t}
          aria-label="回放进度"
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          className="w-full accent-accent"
        />

        <div className="flex flex-wrap gap-3 text-xs text-fg-secondary">
          {accountId ? (
            <label className="flex min-h-[var(--touch-min)] items-center gap-1.5 sm:min-h-0">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => {
                  const on = e.target.checked;
                  setFollow(on);
                  if (on) {
                    const z = Math.max(camZoomRef.current, FOLLOW_ZOOM);
                    camZoomRef.current = z;
                    setCamZoom(z);
                  }
                }}
              />
              跟随
            </label>
          ) : null}
          {(
            [
              ["trail", "轨迹"],
              ["names", "名字"],
              ["zones", "安全区"],
              ["gunlines", "枪线"],
            ] as const
          ).map(([key, label]) => {
            const noGun =
              key === "gunlines" && !(data.gunlines && data.gunlines.length > 0);
            return (
              <label
                key={key}
                className={`flex items-center gap-1.5 ${noGun ? "opacity-40" : ""}`}
                title={noGun ? "无枪线数据（可触发重新解析）" : undefined}
              >
                <input
                  type="checkbox"
                  checked={layers[key]}
                  disabled={noGun}
                  onChange={(e) =>
                    setLayers((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
                {label}
                {noGun ? <span className="text-muted">（无数据）</span> : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
