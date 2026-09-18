import Link from "next/link";

const TABS = [
  { id: "report", label: "报告" },
  { id: "scoreboard", label: "积分板" },
  { id: "timeline", label: "事件轴" },
  { id: "replay", label: "回放" },
  { id: "weapons", label: "武器" },
] as const;

export type MatchTabId = (typeof TABS)[number]["id"];

export function parseMatchTab(raw: string | undefined): MatchTabId {
  if (
    raw === "scoreboard" ||
    raw === "timeline" ||
    raw === "replay" ||
    raw === "weapons"
  ) {
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

  const telemetryReady = telemetryStatus === "ready";

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
    <div className="-mx-4 border-b border-border md:mx-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="对局页标签"
          className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((tab) => {
            const q = new URLSearchParams(base);
            if (tab.id !== "report") q.set("tab", tab.id);
            const href = `/match/${matchId}?${q.toString()}`;
            const isActive = active === tab.id;
            const weaponsLocked = tab.id === "weapons" && !telemetryReady;
            if (weaponsLocked) {
              return (
                <span
                  key={tab.id}
                  title="需遥测就绪后可用"
                  className={`-mb-px shrink-0 cursor-not-allowed border-b-2 border-transparent px-3 py-2.5 text-sm text-muted opacity-60 sm:px-4 ${
                    isActive ? "text-fg-secondary" : ""
                  }`}
                >
                  {tab.label}
                </span>
              );
            }
            return (
              <Link
                key={tab.id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
                  isActive
                    ? "border-accent text-fg"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {telemetryHint ? (
          <span
            className={`mx-4 shrink-0 self-start rounded-full border px-2 py-0.5 text-xs sm:mx-0 sm:self-auto ${
              telemetryStatus === "ready"
                ? "border-success/40 bg-success-muted text-success"
                : telemetryStatus === "pending"
                  ? "border-warning/40 bg-warning-muted text-warning"
                  : "border-border bg-surface-2 text-fg-secondary"
            }`}
          >
            遥测：{telemetryHint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
