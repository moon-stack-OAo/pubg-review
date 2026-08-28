import Link from "next/link";
import {BanStatusCard} from "@/components/ban-status-card";
import {FavoriteButton} from "@/components/favorite-button";
import {FormStatusCard} from "@/components/form-status-card";
import {ReportTagChip} from "@/components/match-report-card";
import {ModeFilter} from "@/components/mode-filter";
import {CompareTabPanel, MapsTabPanel, parsePlayerTab, PlayerTabNav, WeaponsTabPanel,} from "@/components/player-tabs";
import {SquadTabPanel} from "@/components/squad-tab";
import {RefreshButton} from "@/components/refresh-button";
import {SeasonSelect} from "@/components/season-select";
import {SyncHistoryButton} from "@/components/sync-history-button";
import {TrendChart} from "@/components/trend-chart";
import {Card, ErrorBox, Kpi, PageShell} from "@/components/ui";
import {RadarBars, WeaknessTagChips} from "@/components/weakness-tags";
import {getPlayerAnalysisByName, type PlayerAnalysis,} from "@/lib/analysis/player-analysis";
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

type PageProps = {
  params: Promise<{ platform: string; name: string }>;
  searchParams: Promise<{
    gameMode?: string;
    seasonId?: string;
    tag?: string;
    tab?: string;
    vs?: string;
    mates?: string;
    limit?: string;
    refresh?: string;
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
    tab: tabParam = "",
    vs: vsParam = "",
    mates: matesParam = "",
    limit: limitParam = "",
    refresh: refreshParam = "",
  } = await searchParams;
  const name = safeDecodeURIComponent(nameParam);
  const seasonId = seasonIdParam.trim() || undefined;
  const activeTag = tagParam.trim() || undefined;
  const tab = parsePlayerTab(tabParam);
  const vs = vsParam.trim() || undefined;
  const mateNames = parseMateNames(matesParam);
  const squadLimit = parseSquadLimit(limitParam);
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
  let squadStats: SquadStatsResult | null = null;
  let squadError = "";
  let error = "";
  const primaryTags = new Map<string, PrimaryTagInfo | null>();

  try {
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

  const filteredMatches =
    data?.recentMatches.filter((m) => {
      if (!activeTag) return true;
      const tag = primaryTags.get(m.matchId);
      return tag?.code === activeTag;
    }) ?? [];

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
          <div className="flex flex-wrap items-center gap-2">
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
                tab={tab}
                vs={vs}
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
                <WeaponsTabPanel data={weapons} />
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
                  />
                </div>

                <div className="mt-5 border-t border-zinc-800 pt-4">
                  <TrendChart trend={data.trend} />
                </div>
              </Card>

              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-medium">
                    近期对局
                    {activeTag ? (
                      <span className="ml-2 text-sm font-normal text-rose-300">
                        · 已按标签过滤
                      </span>
                    ) : null}
                  </h2>
                  <span className="text-xs text-zinc-500">
                    展示 {filteredMatches.length}
                    {activeTag
                      ? ` / ${data.recentMatches.length}`
                      : ""}{" "}
                    场
                    {data.player.recentMatchCount > 0
                      ? `（官方列表共 ${data.player.recentMatchCount} 场）`
                      : ""}
                  </span>
                </div>

                {data.recentMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">{EMPTY_RECENT_MATCHES}</p>
                ) : filteredMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    当前标签下无匹配对局，
                    <Link
                      href={`/player/${platform}/${encodeURIComponent(name)}${
                        gameMode || seasonId
                          ? `?${new URLSearchParams({
                              ...(gameMode ? { gameMode } : {}),
                              ...(seasonId ? { seasonId } : {}),
                            })}`
                          : ""
                      }`}
                      className="text-amber-300 hover:underline"
                    >
                      清除过滤
                    </Link>
                  </p>
                ) : (
                  <MatchTable
                    rows={filteredMatches}
                    primaryTags={primaryTags}
                    platform={platform}
                    accountId={data.player.accountId}
                    name={name}
                  />
                )}
              </Card>

              {data.localHistoryExtra.length > 0 ? (
                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-medium">
                      历史库
                      <span className="ml-2 text-sm font-normal text-zinc-500">
                        本地已存、不在本次官方近况列表中的对局（去重）
                      </span>
                    </h2>
                    <span className="text-xs text-zinc-500">
                      {data.localHistoryExtra.length} 场 · 共{" "}
                      {data.historyTotal} 场已存
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-zinc-600">
                    官方 API 仅返回约 14 天对局列表。访问概览或「同步近况」会写入
                    `.data/history/`，便于突破列表窗口查看已缓存摘要。
                  </p>
                  <MatchTable
                    rows={data.localHistoryExtra}
                    primaryTags={primaryTags}
                    platform={platform}
                    accountId={data.player.accountId}
                    name={name}
                    showSource
                  />
                </Card>
              ) : data.historyTotal > 0 ? (
                <Card>
                  <p className="text-sm text-zinc-500">
                    本地历史库已存 {data.historyTotal}{" "}
                    场，均已出现在上方官方近况列表中。收藏后可定期点「同步近况」积累更久数据。
                  </p>
                </Card>
              ) : null}
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
                  <td className="px-2 py-2 text-xs text-zinc-500">本地</td>
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

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">综合能力（粗算）</h2>
          <p className="text-xs text-zinc-500">
            基于近 {analysis.sampleSize} 场无遥测报告 · range={analysis.range} ·
            仅供参考
          </p>
        </div>
        <RadarBars radar={analysis.radar} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">主要问题</h2>
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
