import Link from "next/link";

const TABS = [
  { id: "report", label: "报告" },
  { id: "scoreboard", label: "积分板" },
  { id: "timeline", label: "事件轴" },
  { id: "replay", label: "回放" },
] as const;

export type MatchTabId = (typeof TABS)[number]["id"];

export function parseMatchTab(raw: string | undefined): MatchTabId {
  if (raw === "scoreboard" || raw === "timeline" || raw === "replay") {
    return raw;
  }
  return "report";
}

export function MatchTabNav({
  matchId,
  platform,
  accountId,
  name,
  active,
  telemetryStatus,
}: {
  matchId: string;
  platform: string;
  accountId?: string;
  name?: string;
  active: MatchTabId;
  telemetryStatus?: string;
}) {
  const base = new URLSearchParams();
  base.set("platform", platform);
  if (accountId) base.set("accountId", accountId);
  if (name) base.set("name", name);

  const telemetryHint =
    telemetryStatus === "ready"
      ? "遥测就绪"
      : telemetryStatus === "pending"
        ? "解析中"
        : telemetryStatus === "failed"
          ? "解析失败"
          : telemetryStatus === "expired"
            ? "已过期"
            : telemetryStatus === "none"
              ? "无遥测"
              : "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
      <nav className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const q = new URLSearchParams(base);
          if (tab.id !== "report") q.set("tab", tab.id);
          const href = `/match/${matchId}?${q.toString()}`;
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-amber-500/15 text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {telemetryHint ? (
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            telemetryStatus === "ready"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : telemetryStatus === "pending"
                ? "border-amber-800 bg-amber-950/30 text-amber-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-400"
          }`}
        >
          遥测：{telemetryHint}
        </span>
      ) : null}
    </div>
  );
}
