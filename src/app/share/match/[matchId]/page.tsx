import type {Metadata} from "next";
import Link from "next/link";
import {cache} from "react";
import {Card, ErrorBox, PageShell} from "@/components/ui";
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
      <PageShell>
        <ErrorBox message="platform 参数无效" />
      </PageShell>
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
    <PageShell>
      <div className="mx-auto w-full max-w-lg">
        <p className="mb-3 text-center text-xs uppercase tracking-[0.2em] text-zinc-600">
          PUBG Review · 分享卡
        </p>

        {error && <ErrorBox message={error} />}

        {match && (
          <article className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-[0_0_40px_rgba(245,158,11,0.08)]">
            <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
                    {mapLabel(match.mapName)}
                  </h1>
                  <p className="mt-1 text-sm text-zinc-400">
                    {match.gameMode} · {formatDateTime(match.playedAt)}
                  </p>
                </div>
                {focus?.winPlace != null && (
                  <div
                    className={`rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-center ${rankClass(focus.winPlace)}`}
                  >
                    <div className="text-[10px] uppercase text-zinc-500">
                      排名
                    </div>
                    <div className="text-2xl font-bold leading-none">
                      #{focus.winPlace}
                    </div>
                  </div>
                )}
              </div>
              {focus && (
                <p className="mt-3 text-sm font-medium text-amber-200/90">
                  {focus.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-px bg-zinc-800/80">
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
                  <p className="text-xs text-zinc-500">
                    {!report.degraded ? "遥测增强" : "降级初判"} · ruleVersion{" "}
                    {report.ruleVersion}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        report.primaryTag.code === "good_game"
                          ? "rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-sm font-medium text-amber-200"
                          : "rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-sm font-medium text-rose-200"
                      }
                    >
                      {report.primaryTag.label}
                    </span>
                    {report.tags.slice(0, 3).map((t) => (
                      <span
                        key={t.code}
                        className="rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-xs text-zinc-400"
                      >
                        {t.label}
                      </span>
                    ))}
                    <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
                      总置信度{" "}
                      {CONFIDENCE_LABEL[report.confidence] ?? report.confidence}
                    </span>
                  </div>
                  {summaryLines.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-zinc-300">
                      {summaryLines.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-amber-600">·</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {suggestionLines.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        建议
                      </h3>
                      <ul className="space-y-1.5 text-sm text-zinc-300">
                        {suggestionLines.map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-amber-600">→</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : accountId && reportError ? (
                <p className="text-sm text-zinc-500">{reportError}</p>
              ) : accountId && !focus ? (
                <p className="text-sm text-zinc-500">
                  指定玩家不在本场，仅展示对局基础信息。
                </p>
              ) : !accountId ? (
                <p className="text-sm text-zinc-500">
                  未指定玩家：以下为对局基础信息。从玩家页分享可附带复盘标签。
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4 text-xs text-zinc-600">
                <span>只读分享 · 数据来自 PUBG 官方 API</span>
                <Link
                  href={`/match/${matchId}?${detailQs.toString()}`}
                  className="text-amber-400/90 hover:text-amber-300"
                >
                  查看完整报告 →
                </Link>
              </div>
            </div>
          </article>
        )}

        {!match && !error && (
          <Card>
            <p className="text-sm text-zinc-500">加载中…</p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
