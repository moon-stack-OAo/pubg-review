import type {MatchReport} from "@/lib/analysis/report-engine";
import {CopyShareLink} from "@/components/copy-share-link";
import {Card} from "@/components/ui";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function confidenceClass(c: string): string {
  if (c === "high") return "bg-emerald-900/40 text-emerald-300 border-emerald-800";
  if (c === "medium") return "bg-amber-900/40 text-amber-300 border-amber-800";
  return "bg-zinc-800/60 text-zinc-400 border-zinc-700";
}

function primaryBadgeClass(code: string): string {
  if (code === "good_game") {
    return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  }
  return "bg-rose-500/15 text-rose-300 border-rose-500/30";
}

export function MatchReportCard({
  report,
  cached,
  telemetryStatus,
  platform,
}: {
  report: MatchReport;
  cached?: boolean;
  telemetryStatus?: string;
  /** 有 platform 时显示复制分享链接 */
  platform?: string;
}) {
  const enhanced = !report.degraded;
  const telemetryHint = enhanced
    ? "已结合遥测增强"
    : telemetryStatus === "ready"
      ? "遥测已就绪，刷新页面或重算可生成增强报告"
      : telemetryStatus === "pending"
        ? "遥测解析中；就绪后将自动使用增强规则"
        : telemetryStatus === "failed" || telemetryStatus === "expired"
          ? "遥测不可用，仍为初判"
          : "基于基础战绩的初判；加载回放后可增强";

  return (
    <Card className="border-amber-900/30">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">复盘报告</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {telemetryHint} · ruleVersion {report.ruleVersion}
            {enhanced ? " · 遥测增强" : " · 降级初判"}
            {cached != null ? (cached ? " · 缓存命中" : " · 新生成") : ""}
            {telemetryStatus ? ` · telemetry:${telemetryStatus}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {platform ? (
            <CopyShareLink
              matchId={report.matchId}
              platform={platform}
              accountId={report.accountId}
            />
          ) : null}
          <span
            className={`rounded-full border px-3 py-1 text-sm font-medium ${primaryBadgeClass(report.primaryTag.code)}`}
          >
            {report.primaryTag.label}
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {report.tags.map((t) => (
          <span
            key={`${t.code}-${t.confidence}`}
            className={`rounded-md border px-2 py-0.5 text-xs ${confidenceClass(t.confidence)}`}
          >
            {t.label}
            <span className="ml-1 opacity-70">
              ({CONFIDENCE_LABEL[t.confidence] ?? t.confidence})
            </span>
          </span>
        ))}
        <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
          总置信度 {CONFIDENCE_LABEL[report.confidence] ?? report.confidence}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            结论
          </h3>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {report.summaryLines.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-600">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            建议
          </h3>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {report.suggestions.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600">→</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function ReportTagChip({
  label,
  positive,
}: {
  label: string;
  positive?: boolean;
}) {
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-xs ${
        positive
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-300"
      }`}
    >
      {label}
    </span>
  );
}
