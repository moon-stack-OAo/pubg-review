import Link from "next/link";
import {CopyShareLink} from "@/components/copy-share-link";
import {ExportScoreboardCsv} from "@/components/export-scoreboard-csv";
import {MatchReplay} from "@/components/match/match-replay";
import {MatchTabNav, parseMatchTab,} from "@/components/match/match-tab-nav";
import {MatchTimeline} from "@/components/match/match-timeline";
import {MatchWeaponsPanel} from "@/components/match/match-weapons";
import {MatchReportCard} from "@/components/match-report-card";
import {MatchScoreboard} from "@/components/match-scoreboard";
import {AppTopbar, Card, ErrorBox, GameModeChips, PageShell, buttonClass} from "@/components/ui";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {formatDateTime, formatDuration, formatNumber, rankClass,} from "@/lib/format";
import {friendlyErrorMessage} from "@/lib/errors";
import {mapLabel} from "@/lib/pubg/maps";
import {getCachedMatch} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";
import {getTelemetryMeta, getTelemetryStatus} from "@/lib/telemetry/service";

type PageProps = {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{
    platform?: string;
    accountId?: string;
    name?: string;
    tab?: string;
    t?: string;
  }>;
};

function parseInitialT(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export default async function MatchPage({ params, searchParams }: PageProps) {
  const { matchId } = await params;
  const {
    platform = "steam",
    accountId = "",
    name: playerName = "",
    tab: tabRaw = "",
    t: tRaw,
  } = await searchParams;
  const tab = parseMatchTab(tabRaw);
  const initialT = parseInitialT(tRaw);

  if (!isPubgPlatform(platform)) {
    return (
      <div className="flex min-h-full flex-col">
        <AppTopbar
          subtitle="对局详情"
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

  let data = null;
  let cached = false;
  let error = "";
  let report = null as Awaited<
    ReturnType<typeof buildMatchReport>
  >["report"] | null;
  let reportCached = false;
  let reportError = "";
  let telemetryStatus = "none";
  let telemetryError: string | null = null;

  try {
    const result = await getCachedMatch(platform, matchId);
    data = result.value;
    cached = result.cached;
    telemetryStatus = await getTelemetryStatus(matchId);
    const meta = await getTelemetryMeta(matchId);
    telemetryError = meta?.errorMessage ?? null;
    if (telemetryStatus === "none" && !data.telemetryUrl) {
      telemetryStatus = "none";
    }
  } catch (e) {
    error = friendlyErrorMessage(e);
  }

  const focus =
    data && accountId
      ? data.rosters
          .flatMap((r) => r.participants)
          .find((p) => p.accountId === accountId) ?? null
      : null;

  if (data && accountId && focus) {
    try {
      const built = await buildMatchReport(platform, matchId, accountId);
      report = built.report;
      reportCached = built.cached;
    } catch (e) {
      reportError = friendlyErrorMessage(e);
    }
  }

  const backHref = playerName
    ? `/player/${platform}/${encodeURIComponent(playerName)}`
    : "/";

  const refreshQs = new URLSearchParams({ platform });
  if (accountId) refreshQs.set("accountId", accountId);
  if (playerName) refreshQs.set("name", playerName);
  if (tab !== "report") refreshQs.set("tab", tab);

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar
        subtitle="对局详情"
        right={
          <>
            <Link href={backHref} className={buttonClass("ghost", "sm")}>
              {playerName ? "返回玩家" : "首页"}
            </Link>
            {data ? (
              <CopyShareLink
                matchId={matchId}
                platform={platform}
                accountId={accountId || undefined}
              />
            ) : null}
            <Link
              href={`/match/${matchId}?${refreshQs.toString()}`}
              className={buttonClass("secondary", "sm")}
            >
              刷新
            </Link>
          </>
        }
      />
      <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data ? mapLabel(data.mapName) : "对局详情"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {data ? (
              <>
                <GameModeChips gameMode={data.gameMode} />
                <span className="font-mono">
                  {formatDateTime(data.playedAt)} · 时长{" "}
                  {formatDuration(data.durationSec)}
                </span>
              </>
            ) : (
              <span className="font-mono">{matchId}</span>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {data && (
        <>
          <MatchTabNav
            matchId={matchId}
            platform={platform}
            accountId={accountId || undefined}
            name={playerName || undefined}
            active={tab}
            telemetryStatus={telemetryStatus}
          />

          {tab === "report" && (
            <>
              {report ? (
                <MatchReportCard
                  report={report}
                  cached={reportCached}
                  telemetryStatus={telemetryStatus}
                  platform={platform}
                />
              ) : accountId ? (
                reportError ? (
                  <Card className="border-border">
                    <h2 className="font-medium">复盘报告</h2>
                    <p className="mt-2 text-sm text-muted">{reportError}</p>
                  </Card>
                ) : !focus ? (
                  <Card>
                    <h2 className="font-medium">复盘报告</h2>
                    <p className="mt-2 text-sm text-muted">
                      指定的 accountId 不在本场，无法生成个人复盘。
                    </p>
                  </Card>
                ) : null
              ) : (
                <Card>
                  <h2 className="font-medium">复盘报告</h2>
                  <p className="mt-2 text-sm text-muted">
                    请从玩家页进入（带 accountId）以生成个人复盘报告。
                  </p>
                </Card>
              )}

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">个人数据</h2>
                  <span className="text-xs text-muted">
                    {cached ? "缓存命中" : "实时拉取"} · telemetry:{telemetryStatus}
                    {telemetryError ? `（${telemetryError}）` : ""}
                  </span>
                </div>
                {focus ? (
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4 lg:grid-cols-8">
                    <Stat
                      label="排名"
                      value={focus.winPlace == null ? "-" : `#${focus.winPlace}`}
                      className={rankClass(focus.winPlace)}
                    />
                    <Stat label="击杀" value={String(focus.kills)} />
                    <Stat label="助攻" value={String(focus.assists)} />
                    <Stat label="伤害" value={formatNumber(focus.damageDealt, 0)} />
                    <Stat label="存活" value={formatDuration(focus.survivalTimeSec)} />
                    <Stat label="倒地" value={String(focus.dbnos)} />
                    <Stat label="救援" value={String(focus.revives)} />
                    <Stat label="爆头击杀" value={String(focus.headshotKills)} />
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    未指定 accountId，或该玩家不在本场。仍可查看积分板 / 事件轴。
                  </p>
                )}
              </Card>
            </>
          )}

          {tab === "scoreboard" && (
            <Card>
              <div className="mb-3 flex justify-end">
                <ExportScoreboardCsv
                  matchId={matchId}
                  mapLabel={mapLabel(data.mapName)}
                  gameMode={data.gameMode}
                  playedAt={data.playedAt}
                  rosters={data.rosters}
                />
              </div>
              <MatchScoreboard rosters={data.rosters} accountId={accountId} />
            </Card>
          )}

          {tab === "timeline" && (
            <MatchTimeline
              matchId={matchId}
              platform={platform}
              accountId={accountId || undefined}
              playerName={playerName || undefined}
            />
          )}

          {tab === "replay" && (
            <MatchReplay
              matchId={matchId}
              platform={platform}
              accountId={accountId || undefined}
              initialT={initialT}
            />
          )}

          {tab === "weapons" && (
            <MatchWeaponsPanel
              matchId={matchId}
              platform={platform}
              accountId={accountId || undefined}
              playerName={playerName || undefined}
              telemetryStatus={telemetryStatus}
            />
          )}
        </>
      )}
    </PageShell>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${className}`}>{value}</div>
    </div>
  );
}
