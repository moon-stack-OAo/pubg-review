"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {formatDuration} from "@/lib/format";
import type {TelemetryEvent, TelemetryEventsPayload, TelemetryStatus,} from "@/lib/telemetry/types";

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "全部" },
  { id: "kill", label: "击杀" },
  { id: "knock", label: "倒地" },
  { id: "revive", label: "救援" },
  { id: "carePackage", label: "空投" },
];

type Props = {
  matchId: string;
  platform: string;
  accountId?: string;
  playerName?: string;
};

function nameOf(
  players: TelemetryEventsPayload["players"],
  id: string | null | undefined,
): string {
  if (!id) return "未知";
  return players.find((p) => p.accountId === id)?.name ?? id.slice(0, 12);
}

function describe(
  e: TelemetryEvent,
  players: TelemetryEventsPayload["players"],
): string {
  switch (e.type) {
    case "kill":
      return `${nameOf(players, e.attackerId)} 击杀 ${nameOf(players, e.victimId)}${
        e.weaponId ? `（${e.weaponId}）` : ""
      }`;
    case "knock":
      return `${nameOf(players, e.attackerId)} 击倒 ${nameOf(players, e.victimId)}`;
    case "revive":
      return `${nameOf(players, e.reviverId ?? e.attackerId)} 救援 ${nameOf(players, e.victimId)}`;
    case "carePackage":
      return e.label ?? "空投";
    case "zone":
      return e.label ?? "安全区变化";
    default:
      return e.type;
  }
}

function statusMessage(status: TelemetryStatus, err: string | null): string {
  if (status === "pending") return "遥测解析中，请稍候…";
  if (status === "expired") return err || "遥测已过期（官方约保留 14 天）";
  if (status === "failed") return err || "遥测解析失败";
  if (status === "none") return err || "本场无遥测数据";
  return "";
}

export function MatchTimeline({ matchId, platform, accountId, playerName }: Props) {
  const [data, setData] = useState<TelemetryEventsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [parsing, setParsing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<(opts?: { forceParse?: boolean }) => Promise<void>>(
    async () => undefined,
  );

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
      const q = new URLSearchParams({ platform });
      if (accountId) q.set("accountId", accountId);
      q.set("types", "kill,knock,revive,carePackage");
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

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.events;
    return data.events.filter((e) => e.type === filter);
  }, [data, filter]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-500">
        加载事件轴…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  if (!data || data.status !== "ready") {
    const msg = statusMessage(data?.status ?? "none", data?.errorMessage ?? null);
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-sm text-zinc-400">{msg}</p>
        <button
          type="button"
          disabled={parsing || data?.status === "pending"}
          onClick={() => void load({ forceParse: true })}
          className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-amber-500/50 disabled:opacity-50"
        >
          {data?.status === "pending" || parsing ? "解析中…" : "触发解析"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">事件轴</h2>
        <span className="text-xs text-zinc-500">
          共 {data.events.length} 条 · 时长 {formatDuration(data.durationSec)}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              filter === f.id
                ? "bg-amber-500/20 text-amber-300"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">当前筛选下无事件。</p>
      ) : (
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
          {filtered.map((e, i) => {
            const q = new URLSearchParams({ platform, tab: "replay" });
            if (accountId) q.set("accountId", accountId);
            if (playerName) q.set("name", playerName);
            q.set("t", String(Math.floor(e.t)));
            return (
              <li key={`${e.t}-${e.type}-${i}`}>
                <Link
                  href={`/match/${matchId}?${q.toString()}`}
                  title="跳转到回放"
                  className="flex cursor-pointer gap-3 rounded-lg border border-zinc-900/80 bg-zinc-900/30 px-3 py-2 hover:border-amber-500/40 hover:bg-zinc-900/60"
                >
                  <span className="w-14 shrink-0 font-mono text-xs text-amber-400/90">
                    {formatDuration(Math.floor(e.t))}
                  </span>
                  <span className="w-16 shrink-0 text-xs uppercase text-zinc-500">
                    {e.type}
                  </span>
                  <span className="text-zinc-300">{describe(e, data.players)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
