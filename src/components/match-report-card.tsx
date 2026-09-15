import type {MatchReport} from "@/lib/analysis/report-engine";
import {CopyShareLink} from "@/components/copy-share-link";
import {Card} from "@/components/ui";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function confidenceClass(c: string): string {
  if (c === "high") return "bg-success-muted text-success border-success/40";
  if (c === "medium") return "bg-warning-muted text-warning border-warning/40";
  return "bg-surface-hover/60 text-fg-secondary border-border-strong";
}

function primaryBadgeClass(code: string): string {
  if (code === "good_game") {
    return "bg-accent-muted text-accent border-accent-border";
  }
  return "bg-danger-muted text-danger border-danger/40";
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
    <Card className="border-accent-border">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">复盘报告</h2>
          <p className="mt-1 text-xs text-muted">
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
        <span className="rounded-md border border-border-strong px-2 py-0.5 text-xs text-muted">
          总置信度 {CONFIDENCE_LABEL[report.confidence] ?? report.confidence}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            结论
          </h3>
          <ul className="space-y-1.5 text-sm text-fg-secondary">
            {report.summaryLines.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            建议
          </h3>
          <ul className="space-y-1.5 text-sm text-fg-secondary">
            {report.suggestions.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>
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
          ? "border-accent-border bg-accent-muted text-accent"
          : "border-border-strong bg-surface-2 text-fg-secondary"
      }`}
    >
      {label}
    </span>
  );
}
