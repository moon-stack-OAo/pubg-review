import Link from "next/link";
import {BanStatusCard} from "@/components/ban-status-card";
import {FavoriteButton} from "@/components/favorite-button";
import {FormStatusCard} from "@/components/form-status-card";
import {ReportTagChip} from "@/components/match-report-card";
import {ModeFilter} from "@/components/mode-filter";
import {
  buildPlayerHref,
  CompareTabPanel,
  MapsTabPanel,
  parsePlayerTab,
  PlayerTabNav,
  WeaponsTabPanel,
} from "@/components/player-tabs";
import {SquadTabPanel} from "@/components/squad-tab";
import {RefreshButton} from "@/components/refresh-button";
import {SeasonSelect} from "@/components/season-select";
import {SyncHistoryButton} from "@/components/sync-history-button";
import {TrendChart} from "@/components/trend-chart";
import {Card, ErrorBox, Kpi, PageShell} from "@/components/ui";
import {RadarBars, WeaknessTagChips} from "@/components/weakness-tags";
import {getPlayerAnalysisByName, type PlayerAnalysis,} from "@/lib/analysis/player-analysis";
import {WEAK_SAMPLE_THRESHOLD} from "@/lib/analysis/player-analysis-core";
import {getPlayerFormAnalysis, type PlayerFormAnalysis,} from "@/lib/analysis/player-form";
import type {ReportTagCode} from "@/lib/analysis/report-engine";
import {EMPTY_RECENT_MATCHES, friendlyErrorMessage} from "@/lib/errors";
import {formatDateTime, formatDuration, formatNumber, formatPercent, rankClass,} from "@/lib/format";
import type {PubgBanType} from "@/lib/pubg/types";
import {isPubgPlatform} from "@/lib/pubg/types";
import type {ComparePlayerSide, MapsTabData, WeaponsTabData,} from "@/lib/history/types";
import {buildCompareSide, getMapsTabData, getWeaponsTabData,} from "@/lib/history/service";
import {getCachedSeasons, getPlayerDashboard} from "@/lib/pubg/service";
import {getSquadStats} from "@/lib/squad/stats";
import type {SquadStatsResult} from "@/lib/squad/types";

type MatchSortKey = "time" | "rank" | "kills" | "damage";

const MATCH_PAGE_SIZE = 10;

function parseMatchSort(raw: string | undefined): MatchSortKey {
  if (raw === "rank" || raw === "kills" || raw === "damage") return raw;
  return "time";
}

function parseMatchPage(raw: string | undefined): number {
  const n = Number(raw ?? "1");
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

type PageProps = {
  params: Promise<{ platform: string; name: string }>;
  searchParams: Promise<{
    gameMode?: string;
    seasonId?: string;
    tag?: string;
    map?: string;
    tab?: string;
    vs?: string;
    mates?: string;
    limit?: string;
    refresh?: string;
    sort?: string;
    page?: string;
  }>;
};

function parseMateNames(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,，]/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

function parseSquadLimit(raw: string | undefined): number {
  const n = Number(raw ?? "20");
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(Math.floor(n), 1), 32);
}

function safeDecodeURIComponent(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

type PrimaryTagInfo = {
  code: ReportTagCode;
  label: string;
  positive: boolean;
};

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const { platform, name: nameParam } = await params;
  const {
    gameMode = "",
    seasonId: seasonIdParam = "",
    tag: tagParam = "",
    map: mapParam = "",
    tab: tabParam = "",
    vs: vsParam = "",
    mates: matesParam = "",
    limit: limitParam = "",
    refresh: refreshParam = "",
    sort: sortParam = "",
    page: pageParam = "",
  } = await searchParams;
  const name = safeDecodeURIComponent(nameParam);
  const seasonId = seasonIdParam.trim() || undefined;
  const activeTag = tagParam.trim() || undefined;
  const activeMap = mapParam.trim() || undefined;
  const tab = parsePlayerTab(tabParam);
  const vs = vsParam.trim() || undefined;
  const mateNames = parseMateNames(matesParam);
  const squadLimit = parseSquadLimit(limitParam);
  const matchSort = parseMatchSort(sortParam.trim() || undefined);
  const matchPageRaw = parseMatchPage(pageParam.trim() || undefined);
  // 车队 Tab：未指定 gameMode 时默认 squad；其它 Tab 保持原语义（空=默认场次最多）
  const squadGameMode =
    tab === "squad" ? gameMode.trim() || "squad" : gameMode;
  // 车队 Tab：未指定 gameMode 时不过滤（避免默认 squad 漏掉 squad-fpp）；其它 Tab 保持原语义
  const squadGameMode = tab === "squad" ? gameMode.trim() : gameMode;

  if (!isPubgPlatform(platform)) {
    return (
      <PageShell>
        <ErrorBox message="平台无效，请使用 steam/kakao/xbox/psn" />
      </PageShell>
    );
  }

  let data = null;
  let seasons: Awaited<ReturnType<typeof getCachedSeasons>>["value"] = [];
  let analysis: PlayerAnalysis | null = null;
  let formAnalysis: PlayerFormAnalysis | null = null;
  let formError = "";
  let weapons: WeaponsTabData | null = null;
  let maps: MapsTabData | null = null;
  let compareLeft: ComparePlayerSide | null = null;
  let compareRight: ComparePlayerSide | null = null;
  let compareError = "";
  let compareRightForm: PlayerFormAnalysis | null = null;
  let compareRightFormUnavailable = false;
  let squadStats: SquadStatsResult | null = null;
  let squadError = "";
  let error = "";
  const primaryTags = new Map<string, PrimaryTagInfo | null>();

  try {
    const [dashboard, seasonsResult, formResult] = await Promise.all([
      getPlayerDashboard(platform, name, {
        gameMode: gameMode || undefined,
        seasonId,
        recentLimit: 20,
      }),
      getCachedSeasons(platform),
      getPlayerFormAnalysis(platform, name, {
        gameMode: gameMode || undefined,
        seasonId,
      }).then(
        (value) => ({ ok: true as const, value }),
        (e: unknown) => ({
          ok: false as const,
          error: friendlyErrorMessage(e),
        }),
      ),
    ]);
    data = dashboard;
    seasons = seasonsResult.value;
    if (formResult.ok) {
      formAnalysis = formResult.value;
    } else {
      formError = formResult.error;
    }

    for (const m of data.recentMatches) {
      try {
        const { report } = await buildMatchReport(
          platform,
          m.matchId,
          data.player.accountId,
        );
        primaryTags.set(m.matchId, {
          code: report.primaryTag.code,
          label: report.primaryTag.label,
          positive: report.primaryTag.code === "good_game",
        });
      } catch {
        primaryTags.set(m.matchId, null);
    const seasonsPromise = getCachedSeasons(platform);
    // 页头仍要 player/season；非 overview 用 recentLimit:0 跳过近场报告
    const headerDashboard = () =>
      getPlayerDashboard(platform, name, {
        gameMode: gameMode || undefined,
        seasonId,
        recentLimit: 0,
      });

    if (tab === "overview") {
      const [dashboard, seasonsResult, formResult] = await Promise.all([
        getPlayerDashboard(platform, name, {
          gameMode: gameMode || undefined,
          seasonId,
          recentLimit: 5,
        }),
        seasonsPromise,
        getPlayerFormAnalysis(platform, name, {
          gameMode: gameMode || undefined,
          seasonId,
        }).then(
          (value) => ({ ok: true as const, value }),
          (e: unknown) => ({
            ok: false as const,
            error: friendlyErrorMessage(e),
          }),
        ),
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      if (formResult.ok) {
        formAnalysis = formResult.value;
      } else {
        formError = formResult.error;
      }
      for (const [matchId, tag] of Object.entries(dashboard.primaryTags)) {
        primaryTags.set(matchId, tag);
      }
    } else if (tab === "analysis") {
      const [dashboard, seasonsResult, analysisResult] = await Promise.all([
        headerDashboard(),
        seasonsPromise,
        getPlayerAnalysisByName(platform, name, { range: "20m" }),
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      analysis = analysisResult;
    } else if (tab === "weapons") {
      const [dashboard, seasonsResult] = await Promise.all([
        headerDashboard(),
        seasonsPromise,
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      weapons = await getWeaponsTabData(dashboard.player.accountId, {
        gameMode: gameMode || undefined,
        limit: 20,
      });
    } else if (tab === "maps") {
      const [dashboard, seasonsResult] = await Promise.all([
        headerDashboard(),
        seasonsPromise,
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      maps = await getMapsTabData(dashboard.player.accountId, {
        gameMode: gameMode || undefined,
        limit: 50,
      });
    } else if (tab === "compare") {
      const [dashboard, seasonsResult] = await Promise.all([
        headerDashboard(),
        seasonsPromise,
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      if (vs) {
        try {
          const [left, right] = await Promise.all([
            buildCompareSide(platform, name, {
              gameMode: gameMode || undefined,
              seasonId,
            }),
            buildCompareSide(platform, vs, {
              gameMode: gameMode || undefined,
              seasonId,
            }),
          ]);
          compareLeft = left;
          compareRight = right;
        } catch (e) {
          compareError = friendlyErrorMessage(e);
        }
      }
      // 近况/弱点：串行队列末尾；失败不影响 KPI
      if (compareLeft && compareRight) {
        try {
          compareRightForm = await getPlayerFormAnalysis(platform, vs, {
            gameMode: gameMode || undefined,
            seasonId,
          });
        } catch {
          compareRightFormUnavailable = true;
        }
      }
    } else if (tab === "squad" && mateNames.length > 0) {
      try {
        const squadRefresh =
          refreshParam === "1" || refreshParam === "true";
        squadStats = await getSquadStats({
          platform,
          playerName: name,
          mateNames,
          limit: squadLimit,
          gameMode: squadGameMode,
          refresh: squadRefresh,
        });
      } catch (e) {
        squadError = friendlyErrorMessage(e);
    } else if (tab === "squad") {
      const [dashboard, seasonsResult] = await Promise.all([
        headerDashboard(),
        seasonsPromise,
      ]);
      data = dashboard;
      seasons = seasonsResult.value;
      if (mateNames.length > 0) {
        try {
          const squadRefresh =
            refreshParam === "1" || refreshParam === "true";
          squadStats = await getSquadStats({
            platform,
            playerName: name,
            mateNames,
            limit: squadLimit,
            gameMode: squadGameMode,
            refresh: squadRefresh,
          });
        } catch (e) {
          squadError = friendlyErrorMessage(e);
        }
      }
    }
  } catch (e) {
    error = friendlyErrorMessage(e);
  }

  const stats = data?.selectedStats;
  const activeSeasonId =
    data?.season.seasonId ||
    seasons.find((s) => s.isCurrent)?.id ||
    seasons[0]?.id ||
    "";

  const mergedMatches = data
    ? [...data.recentMatches, ...data.localHistoryExtra]
    : [];

  const filteredMatches = mergedMatches.filter((m) => {
    if (activeMap && m.mapName !== activeMap) return false;
    if (gameMode && m.gameMode !== gameMode) return false;
    if (!activeTag) return true;
    const tag = primaryTags.get(m.matchId);
    return tag?.code === activeTag;
  });

  const sortedMatches = [...filteredMatches].sort((a, b) => {
    if (matchSort === "rank") {
      if (a.rank == null && b.rank == null) {
        return +new Date(b.playedAt) - +new Date(a.playedAt);
      }
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return +new Date(b.playedAt) - +new Date(a.playedAt);
    }
    if (matchSort === "kills") {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return +new Date(b.playedAt) - +new Date(a.playedAt);
    }
    if (matchSort === "damage") {
      if (b.damage !== a.damage) return b.damage - a.damage;
      return +new Date(b.playedAt) - +new Date(a.playedAt);
    }
    return +new Date(b.playedAt) - +new Date(a.playedAt);
  });

  const matchTotalPages = Math.max(
    1,
    Math.ceil(sortedMatches.length / MATCH_PAGE_SIZE),
  );
  const matchPage = Math.min(matchPageRaw, matchTotalPages);
  const pagedMatches = sortedMatches.slice(
    (matchPage - 1) * MATCH_PAGE_SIZE,
    matchPage * MATCH_PAGE_SIZE,
  );

  function matchListHref(opts: {
    tag?: string;
    map?: string;
    sort?: MatchSortKey;
    page?: number;
    clearTag?: boolean;
    clearMap?: boolean;
  }) {
    const nextTag = opts.clearTag
      ? undefined
      : opts.tag !== undefined
        ? opts.tag || undefined
        : activeTag;
    const nextMap = opts.clearMap
      ? undefined
      : opts.map !== undefined
        ? opts.map || undefined
        : activeMap;
    const nextSort = opts.sort ?? matchSort;
    return buildPlayerHref(platform, name, {
      gameMode: gameMode || undefined,
      seasonId,
      tag: nextTag,
      map: nextMap,
      sort: nextSort === "time" ? undefined : nextSort,
      page: opts.page && opts.page > 1 ? opts.page : undefined,
    });
  }

  const modeOptions =
    data?.season.modeStats.map((m) => ({
      gameMode: m.gameMode,
      roundsPlayed: m.roundsPlayed,
    })) ?? [];

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-300">
              ← 返回搜索
            </Link>
            <Link href="/favorites" className="hover:text-zinc-300">
              收藏
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-zinc-500">
            {platform}
            {data ? ` · ${data.player.accountId}` : ""}
          </p>
          {data?.renameHint.previousName &&
          data.renameHint.knownNames.length > 1 ? (
            <p className="mt-1 text-sm text-amber-300/90">
              {data.renameHint.renamed ? "检测到改名：" : "曾用名："}「
              {data.renameHint.previousName}」
              {data.renameHint.knownNames.length > 2
                ? ` · 共见过 ${data.renameHint.knownNames.length} 个昵称`
                : ""}
            </p>
          ) : null}
        </div>
        {data ? (
          <div className="flex flex-wrap items-start gap-2">
            <FavoriteButton
              accountId={data.player.accountId}
              platform={platform}
              name={name}
            />
            <SyncHistoryButton
              accountId={data.player.accountId}
              platform={platform}
              name={name}
            />
            <RefreshButton
              accountId={data.player.accountId}
              platform={platform}
              name={name}
              seasonId={seasonId}
            />
          </div>
        ) : null}
      </div>

      {error && <ErrorBox message={error} />}

      {data && (
        <>
          <BanStatusCard
            banType={(data.player.banType ?? "Unknown") as PubgBanType}
            checkedAt={formatDateTime(data.syncedAt)}
          />

          <PlayerTabNav
            platform={platform}
            name={name}
            tab={tab}
            gameMode={
              tab === "squad"
                ? squadGameMode || undefined
                : gameMode || undefined
            }
            seasonId={seasonId}
            tag={activeTag}
            vs={vs}
            mates={mateNames.length ? mateNames.join(",") : undefined}
            limit={
              tab === "squad" && squadLimit !== 20
                ? String(squadLimit)
                : undefined
            }
          />

          {(tab === "weapons" || tab === "maps" || tab === "compare") &&
          modeOptions.length > 0 ? (
            <Card>
                <ModeFilter
                  platform={platform}
                  name={name}
                  current={gameMode}
                  seasonId={seasonId}
                  map={activeMap}
                  tab={tab}
                  vs={vs}
                  sort={matchSort === "time" ? undefined : matchSort}
                  options={modeOptions}
                />
            </Card>
          ) : null}

          {tab === "analysis" ? (
            <AnalysisSection
              analysis={analysis}
              platform={platform}
              name={name}
              gameMode={gameMode || undefined}
              seasonId={seasonId}
            />
          ) : tab === "weapons" ? (
            <Card>
              <h2 className="mb-3 font-medium">武器 / 战斗聚合</h2>
              {weapons ? (
                <WeaponsTabPanel
                  data={weapons}
                  platform={platform}
                  name={name}
                />
              ) : (
                <p className="text-sm text-zinc-500">暂无数据</p>
              )}
            </Card>
          ) : tab === "maps" ? (
            <Card>
              <h2 className="mb-3 font-medium">地图聚合</h2>
              {maps ? (
                <MapsTabPanel
                  rows={maps.rows}
                  sampleSize={maps.sampleSize}
                  gameModeFilter={maps.gameModeFilter}
                  platform={platform}
                  name={name}
                  gameMode={gameMode || undefined}
                />
              ) : (
                <p className="text-sm text-zinc-500">暂无数据</p>
              )}
            </Card>
          ) : tab === "compare" ? (
            <Card>
              <h2 className="mb-3 font-medium">玩家对比</h2>
              <CompareTabPanel
                platform={platform}
                name={name}
                gameMode={gameMode || undefined}
                seasonId={seasonId}
                vs={vs}
                left={compareLeft}
                right={compareRight}
                error={compareError || undefined}
                leftForm={formAnalysis?.form ?? null}
                rightForm={compareRightForm?.form ?? null}
                leftWeakness={data.weaknessTags}
                rightWeakness={compareRightForm?.weaknessTags ?? []}
                leftFormUnavailable={!formAnalysis}
                rightFormUnavailable={compareRightFormUnavailable}
              />
            </Card>
          ) : tab === "squad" ? (
            <Card>
              <h2 className="mb-3 font-medium">车队同场统计</h2>
              <SquadTabPanel
                platform={platform}
                name={name}
                accountId={data.player.accountId}
                mates={mateNames}
                limit={squadLimit}
                gameMode={squadGameMode}
                stats={squadStats}
                error={squadError || undefined}
              />
            </Card>
          ) : (
            <>
              <FormStatusCard
                analysis={formAnalysis}
                error={formError || undefined}
                platform={platform}
                accountId={data.player.accountId}
                name={name}
                gameMode={gameMode || undefined}
                seasonId={seasonId}
              />

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
                  <div className="flex flex-wrap items-center gap-3">
                    {seasons.length > 0 ? (
                      <SeasonSelect
                        platform={platform}
                        name={name}
                        currentSeasonId={activeSeasonId}
                        gameMode={gameMode || undefined}
                        tag={activeTag}
                        map={activeMap}
                        sort={matchSort === "time" ? undefined : matchSort}
                        options={seasons}
                      />
                    ) : (
                      <span>赛季：{data.season.seasonId}</span>
                    )}
                    <span className="text-zinc-600">·</span>
                    <span>
                      缓存：玩家 {data.cached.player ? "命中" : "未命中"} / 赛季{" "}
                      {data.cached.season ? "命中" : "未命中"}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>本地历史库 {data.historyTotal} 场</span>
                  </div>
                </div>

                <ModeFilter
                  platform={platform}
                  name={name}
                  current={gameMode}
                  seasonId={seasonId}
                  tag={activeTag}
                  map={activeMap}
                  sort={matchSort === "time" ? undefined : matchSort}
                  options={modeOptions}
                />

                {stats ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    <Kpi label="KD" value={formatNumber(stats.kd, 2)} />
                    <Kpi label="胜率" value={formatPercent(stats.winRate)} />
                    <Kpi
                      label="场均伤害"
                      value={formatNumber(stats.avgDamage, 0)}
                    />
                    <Kpi
                      label="场均存活"
                      value={formatDuration(stats.avgSurvivalTimeSec)}
                    />
                    <Kpi label="场次" value={String(stats.roundsPlayed)} />
                    <Kpi label="Top10" value={formatPercent(stats.top10Rate)} />
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">
                    当前赛季暂无可用模式数据。
                  </p>
                )}

                <div className="mt-5 border-t border-zinc-800 pt-4">
                  <h3 className="mb-2 text-sm font-medium text-zinc-300">
                    弱点标签
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      近 {data.recentMatches.length} 场主因聚合 · 点击过滤对局
                    </span>
                  </h3>
                  <WeaknessTagChips
                    tags={data.weaknessTags}
                    platform={platform}
                    name={name}
                    activeTag={activeTag}
                    gameMode={gameMode || undefined}
                    seasonId={seasonId}
                    map={activeMap}
                    sort={matchSort === "time" ? undefined : matchSort}
                  />
                </div>

                <div className="mt-5 border-t border-zinc-800 pt-4">
                  <TrendChart trend={data.trend} />
                </div>
              </Card>

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">
                    对局列表
                    {activeTag ? (
                      <span className="ml-2 text-sm font-normal text-rose-300">
                        · 已按标签过滤
                      </span>
                    ) : null}
                    {activeMap ? (
                      <span className="ml-2 text-sm font-normal text-emerald-300">
                        · 已按地图过滤
                      </span>
                    ) : null}
                    {gameMode ? (
                      <span className="ml-2 text-sm font-normal text-sky-300">
                        · 模式 {gameMode}
                      </span>
                    ) : null}
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {sortedMatches.length} 场
                    {sortedMatches.length > MATCH_PAGE_SIZE
                      ? ` · 第 ${matchPage}/${matchTotalPages} 页`
                      : ""}
                    {data.player.recentMatchCount > 0
                      ? `（官方列表共 ${data.player.recentMatchCount} 场）`
                      : ""}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-zinc-500">排序</span>
                  {(
                    [
                      { key: "time", label: "时间" },
                      { key: "rank", label: "排名" },
                      { key: "kills", label: "击杀" },
                      { key: "damage", label: "伤害" },
                    ] as const
                  ).map((item) => {
                    const active = matchSort === item.key;
                    return (
                      <Link
                        key={item.key}
                        href={matchListHref({
                          sort: item.key,
                          page: 1,
                        })}
                        className={`rounded-full px-2.5 py-0.5 ${
                          active
                            ? "bg-amber-500 text-black"
                            : "border border-zinc-700 text-zinc-300 hover:border-amber-500/50"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                  {(activeTag || activeMap) && (
                    <Link
                      href={matchListHref({
                        clearTag: true,
                        clearMap: true,
                        page: 1,
                      })}
                      className="ml-1 text-xs text-amber-300 hover:underline"
                    >
                      清除过滤
                    </Link>
                  )}
                </div>

                {activeTag ? (
                  <p className="mb-3 text-xs text-zinc-600">
                    标签过滤仅覆盖已生成报告的对局；本地历史库无报告场会被排除。
                  </p>
                ) : null}

                {mergedMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">{EMPTY_RECENT_MATCHES}</p>
                ) : sortedMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    当前过滤条件下无匹配对局，
                    <Link
                      href={matchListHref({
                        clearTag: true,
                        clearMap: true,
                        page: 1,
                      })}
                      className="text-amber-300 hover:underline"
                    >
                      清除过滤
                    </Link>
                  </p>
                ) : (
                  <>
                    <MatchTable
                      rows={pagedMatches}
                      primaryTags={primaryTags}
                      platform={platform}
                      accountId={data.player.accountId}
                      name={name}
                      showSource
                    />
                    {matchTotalPages > 1 ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-500">
                          每页 {MATCH_PAGE_SIZE} 场
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {matchPage > 1 ? (
                            <Link
                              href={matchListHref({ page: matchPage - 1 })}
                              className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-amber-500/50"
                            >
                              上一页
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-zinc-800 px-3 py-1 text-zinc-600">
                              上一页
                            </span>
                          )}
                          <span className="tabular-nums text-zinc-400">
                            {matchPage} / {matchTotalPages}
                          </span>
                          {matchPage < matchTotalPages ? (
                            <Link
                              href={matchListHref({ page: matchPage + 1 })}
                              className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-amber-500/50"
                            >
                              下一页
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-zinc-800 px-3 py-1 text-zinc-600">
                              下一页
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function MatchTable({
  rows,
  primaryTags,
  platform,
  accountId,
  name,
  showSource = false,
}: {
  rows: {
    matchId: string;
    playedAt: string;
    mapName?: string;
    mapLabel: string;
    gameMode: string;
    rank: number | null;
    kills: number;
    damage: number;
    survivalTimeSec: number;
    source?: string;
  }[];
  primaryTags: Map<string, PrimaryTagInfo | null>;
  platform: string;
  accountId: string;
  name: string;
  showSource?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-zinc-500">
          <tr>
            <th className="px-2 py-2 font-medium">时间</th>
            <th className="px-2 py-2 font-medium">地图</th>
            <th className="px-2 py-2 font-medium">模式</th>
            <th className="px-2 py-2 font-medium">排名</th>
            <th className="px-2 py-2 font-medium">击杀</th>
            <th className="px-2 py-2 font-medium">伤害</th>
            <th className="px-2 py-2 font-medium">存活</th>
            <th className="px-2 py-2 font-medium">标签</th>
            {showSource ? (
              <th className="px-2 py-2 font-medium">来源</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const tag = primaryTags.get(m.matchId);
            return (
              <tr
                key={m.matchId}
                className="border-t border-zinc-800/80 hover:bg-zinc-900/50"
              >
                <td className="px-2 py-2">
                  <Link
                    href={`/match/${m.matchId}?platform=${platform}&accountId=${encodeURIComponent(accountId)}&name=${encodeURIComponent(name)}`}
                    className="text-amber-300 hover:underline"
                  >
                    {formatDateTime(m.playedAt)}
                  </Link>
                </td>
                <td className="px-2 py-2">{m.mapLabel}</td>
                <td className="px-2 py-2">{m.gameMode}</td>
                <td className={`px-2 py-2 font-medium ${rankClass(m.rank)}`}>
                  {m.rank == null ? "-" : `#${m.rank}`}
                </td>
                <td className="px-2 py-2">{m.kills}</td>
                <td className="px-2 py-2">{formatNumber(m.damage, 0)}</td>
                <td className="px-2 py-2">
                  {formatDuration(m.survivalTimeSec)}
                </td>
                <td className="px-2 py-2">
                  {tag ? (
                    <ReportTagChip
                      label={tag.label}
                      positive={tag.positive}
                    />
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </td>
                {showSource ? (
                  <td className="px-2 py-2 text-xs text-zinc-500">
                    {m.source === "local" ? "本地" : "官方"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisSection({
  analysis,
  platform,
  name,
  gameMode,
  seasonId,
}: {
  analysis: PlayerAnalysis | null;
  platform: string;
  name: string;
  gameMode?: string;
  seasonId?: string;
}) {
  if (!analysis) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">分析数据加载失败或样本为空。</p>
      </Card>
    );
  }

  const { sampleSize } = analysis;
  const weakSample = sampleSize > 0 && sampleSize < WEAK_SAMPLE_THRESHOLD;

  if (sampleSize === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">
          暂无可用复盘报告样本，请先同步近况或打开对局生成报告后再查看分析。
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">综合能力（粗算）</h2>
          <p className="text-xs text-zinc-500">
            基于近 {sampleSize}{" "}
            场复盘报告聚合（降级初判或遥测增强）· range={analysis.range} ·
            仅供参考
          </p>
        </div>
        {weakSample ? (
          <p className="text-sm text-amber-200/90">
            样本不足（{sampleSize} 场），诊断置信度低
          </p>
        ) : (
          <RadarBars radar={analysis.radar} />
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">主要问题</h2>
          {weakSample ? (
            <p className="mb-2 text-xs text-zinc-500">样本偏少，以下仅供参考</p>
          ) : null}
          {analysis.topIssues.length === 0 ? (
            <p className="text-sm text-zinc-500">近期无明显负向主因。</p>
          ) : (
            <ul className="space-y-2">
              {analysis.topIssues.map((issue, i) => {
                const q = new URLSearchParams();
                if (gameMode) q.set("gameMode", gameMode);
                if (seasonId) q.set("seasonId", seasonId);
                q.set("tag", issue.code);
                return (
                  <li
                    key={issue.code}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-zinc-300">
                      {i + 1}. {issue.label}
                      <span className="ml-2 text-zinc-500">
                        （{issue.count} 场）
                      </span>
                    </span>
                    <Link
                      href={`/player/${platform}/${encodeURIComponent(name)}?${q}`}
                      className="text-xs text-amber-300 hover:underline"
                    >
                      查看对局
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">改进建议</h2>
          {weakSample ? (
            <p className="mb-2 text-xs text-zinc-500">样本偏少，以下仅供参考</p>
          ) : null}
          {analysis.suggestions.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无聚合建议。</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-zinc-300">
              {analysis.suggestions.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600">→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
