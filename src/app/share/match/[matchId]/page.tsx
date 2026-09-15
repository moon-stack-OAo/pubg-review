import type {Metadata} from "next";
import Link from "next/link";
import {cache} from "react";
import {AppTopbar, Card, ErrorBox, GameModeChips, PageShell, buttonClass} from "@/components/ui";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {formatDateTime, formatDuration, formatNumber, rankClass,} from "@/lib/format";
import {friendlyErrorMessage} from "@/lib/errors";
import {mapLabel} from "@/lib/pubg/maps";
import {getCachedMatch} from "@/lib/pubg/service";
import {isPubgPlatform, type PubgPlatform} from "@/lib/pubg/types";

type PageProps = {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{
    platform?: string;
    accountId?: string;
  }>;
};

const loadShareMatch = cache(async (platform: PubgPlatform, matchId: string) => {
  return getCachedMatch(platform, matchId);
});

const loadShareReport = cache(
  async (platform: PubgPlatform, matchId: string, accountId: string) => {
    return buildMatchReport(platform, matchId, accountId);
  },
);

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { matchId } = await params;
  const { platform = "steam", accountId = "" } = await searchParams;
  if (!isPubgPlatform(platform)) {
    return { title: "对局分享 · PUBG Review" };
  }
  try {
    const { value: match } = await loadShareMatch(platform, matchId);
    const map = mapLabel(match.mapName);
    let title = `${map} · ${match.gameMode} · PUBG Review`;
    let description = `${formatDateTime(match.playedAt)} · 时长 ${formatDuration(match.durationSec)}`;
    let primaryLabel = "";
    if (accountId) {
      const focus = match.rosters
        .flatMap((r) => r.participants)
        .find((p) => p.accountId === accountId);
      if (focus) {
        title = `${focus.name} · ${map} #${focus.winPlace ?? "-"} · PUBG Review`;
        description = `#${focus.winPlace ?? "-"} · 击杀 ${focus.kills} · ${map}`;
        try {
          const { report } = await buildMatchReport(
            platform,
            matchId,
            accountId,
          );
          primaryLabel = report.primaryTag.label;
          description = `#${focus.winPlace ?? "-"} · 击杀 ${focus.kills} · ${primaryLabel} · ${map}`;
        } catch {
          /* keep base description */
        }
      }
    }
    const ogQs = new URLSearchParams({ platform });
    if (accountId) ogQs.set("accountId", accountId);
    const ogImage = `/share/match/${matchId}/og?${ogQs.toString()}`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImage, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {
      title: "对局分享 · PUBG Review",
      description: "PUBG 对局复盘分享卡",
    };
  }
}

export default async function ShareMatchPage({
  params,
  searchParams,
}: PageProps) {
  const { matchId } = await params;
  const { platform = "steam", accountId = "" } = await searchParams;

  if (!isPubgPlatform(platform)) {
    return (
      <div className="flex min-h-full flex-col">
        <AppTopbar
          subtitle="分享卡"
          right={
            <Link href="/" className={buttonClass("ghost", "sm")}>
              首页
            </Link>
          }
        />
        <PageShell>
          <ErrorBox message="platform 参数无效" />
        </PageShell>
      </div>
    );
  }

  let error = "";
  let match = null as Awaited<
    ReturnType<typeof getCachedMatch>
  >["value"] | null;
  let report = null as Awaited<
    ReturnType<typeof buildMatchReport>
  >["report"] | null;
  let reportError = "";

  try {
    const result = await loadShareMatch(platform, matchId);
    match = result.value;
  } catch (e) {
    error = friendlyErrorMessage(e);
  }

  const focus =
    match && accountId
      ? match.rosters
          .flatMap((r) => r.participants)
          .find((p) => p.accountId === accountId) ?? null
      : null;

  if (match && accountId && focus) {
    try {
      const built = await loadShareReport(platform, matchId, accountId);
      report = built.report;
    } catch (e) {
      reportError = friendlyErrorMessage(e);
    }
  }

  const detailQs = new URLSearchParams({ platform });
  if (accountId) detailQs.set("accountId", accountId);
  if (focus?.name) detailQs.set("name", focus.name);

  const summaryLines = (report?.summaryLines ?? []).slice(0, 3);
  const suggestionLines = (report?.suggestions ?? []).slice(0, 3);

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar
        subtitle="分享卡"
        right={
          <>
            <Link
              href={`/match/${matchId}?${detailQs.toString()}`}
              className={buttonClass("secondary", "sm")}
            >
              完整报告
            </Link>
            <Link href="/" className={buttonClass("ghost", "sm")}>
              首页
            </Link>
          </>
        }
      />
      <PageShell>
      <div className="mx-auto w-full max-w-lg">
        <p className="mb-3 text-center text-xs uppercase tracking-[0.2em] text-muted">
          PUBG Review · 分享卡
        </p>

        {error && <ErrorBox message={error} />}

        {match && (
          <article className="overflow-hidden rounded-xl border border-accent-border bg-gradient-to-b from-surface via-bg to-bg shadow-[var(--shadow-md)]">
            <div className="border-b border-accent-border bg-accent-muted px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-fg">
                    {mapLabel(match.mapName)}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
                    <GameModeChips gameMode={match.gameMode} size="sm" />
                    <span>{formatDateTime(match.playedAt)}</span>
                  </div>
                </div>
                {focus?.winPlace != null && (
                  <div
                    className={`rounded-xl border border-border-strong bg-bg px-3 py-2 text-center ${rankClass(focus.winPlace)}`}
                  >
                    <div className="text-[10px] uppercase text-muted">
                      排名
                    </div>
                    <div className="text-2xl font-bold leading-none">
                      #{focus.winPlace}
                    </div>
                  </div>
                )}
              </div>
              {focus && (
                <p className="mt-3 text-sm font-medium text-fg">
                  {focus.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-px bg-surface-hover">
              <ShareStat
                label="击杀"
                value={focus ? String(focus.kills) : "—"}
              />
              <ShareStat
                label="伤害"
                value={
                  focus ? formatNumber(focus.damageDealt, 0) : "—"
                }
              />
              <ShareStat
                label="存活"
                value={
                  focus
                    ? formatDuration(focus.survivalTimeSec)
                    : formatDuration(match.durationSec)
                }
              />
            </div>

            <div className="space-y-4 px-5 py-4">
              {report ? (
                <>
                  <p className="text-xs text-muted">
                    {!report.degraded ? "遥测增强" : "降级初判"} · ruleVersion{" "}
                    {report.ruleVersion}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        report.primaryTag.code === "good_game"
                          ? "rounded-full border border-accent-border bg-accent-muted px-3 py-1 text-sm font-medium text-accent"
                          : "rounded-full border border-danger/40 bg-danger-muted px-3 py-1 text-sm font-medium text-danger"
                      }
                    >
                      {report.primaryTag.label}
                    </span>
                    {report.tags.slice(0, 3).map((t) => (
                      <span
                        key={t.code}
                        className="rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 text-xs text-fg-secondary"
                      >
                        {t.label}
                      </span>
                    ))}
                    <span className="rounded-md border border-border-strong px-2 py-0.5 text-xs text-muted">
                      总置信度{" "}
                      {CONFIDENCE_LABEL[report.confidence] ?? report.confidence}
                    </span>
                  </div>
                  {summaryLines.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-fg-secondary">
                      {summaryLines.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">·</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {suggestionLines.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                        建议
                      </h3>
                      <ul className="space-y-1.5 text-sm text-fg-secondary">
                        {suggestionLines.map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-accent">→</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : accountId && reportError ? (
                <p className="text-sm text-muted">{reportError}</p>
              ) : accountId && !focus ? (
                <p className="text-sm text-muted">
                  指定玩家不在本场，仅展示对局基础信息。
                </p>
              ) : !accountId ? (
                <p className="text-sm text-muted">
                  未指定玩家：以下为对局基础信息。从玩家页分享可附带复盘标签。
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted">
                <span>只读分享 · 数据来自 PUBG 官方 API</span>
                <Link
                  href={`/match/${matchId}?${detailQs.toString()}`}
                  className="text-accent hover:text-accent"
                >
                  查看完整报告 →
                </Link>
              </div>
            </div>
          </article>
        )}

        {!match && !error && (
          <Card>
            <p className="text-sm text-muted">加载中…</p>
          </Card>
        )}
      </div>
    </PageShell>
    </div>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}
