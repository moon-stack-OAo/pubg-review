import {getPlayerAnalysisByName} from "@/lib/analysis/player-analysis";
import {getPlayerFormAnalysis} from "@/lib/analysis/player-form";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {friendlyErrorMessage} from "@/lib/errors";
import {buildCompareSide, getWeaponsTabData, getMapsTabData, listLocalHistory} from "@/lib/history/service";
import {getCachedMatch, getCachedPlayer, getCachedSeasons, getPlayerDashboard,} from "@/lib/pubg/service";
import {PUBG_PLATFORMS, type PubgPlatform} from "@/lib/pubg/types";
import {detectFrequentMates} from "@/lib/squad/detect-mates";
import {getSquadStats} from "@/lib/squad/stats";
import {getTelemetryStatus} from "@/lib/telemetry/service";
import type {McpServer} from "@modelcontextprotocol/server";
import {z} from "zod";

const platformSchema = z.enum(PUBG_PLATFORMS as [PubgPlatform, ...PubgPlatform[]]);

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: friendlyErrorMessage(error),
      },
    ],
  };
}

export function registerPubgMcpTools(server: McpServer) {
  server.registerTool(
    "search_player",
    {
      title: "搜索 PUBG 玩家",
      description:
        "按平台与昵称搜索玩家，返回 accountId、banType、近期对局数量等基础信息。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("游戏内昵称（大小写需与游戏内一致）"),
      }),
    },
    async ({ platform, name }) => {
      try {
        const { value: player, cached } = await getCachedPlayer(platform, name);
        return textResult({
          accountId: player.accountId,
          name: player.name,
          platform: player.platform,
          shard: player.shard,
          banType: player.banType,
          recentMatchCount: player.matchIds.length,
          cached,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_player_dashboard",
    {
      title: "玩家战绩概览",
      description:
        "获取玩家 dashboard：赛季 KPI、近期对局、弱点标签与趋势等聚合数据。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("游戏内昵称"),
        gameMode: z.string().optional().describe("可选游戏模式，如 squad-fpp"),
        seasonId: z.string().optional().describe("可选赛季 ID，默认当前赛季"),
        recentLimit: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe("近期对局条数，1-8，默认 5"),
      }),
    },
    async ({ platform, name, gameMode, seasonId, recentLimit }) => {
      try {
        const dashboard = await getPlayerDashboard(platform, name, {
          gameMode,
          seasonId,
          recentLimit: recentLimit ?? 5,
        });
        return textResult(dashboard);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_match",
    {
      title: "对局详情",
      description:
        "按 matchId 获取对局详情（积分板/队伍），可指定 accountId 聚焦某位玩家。不返回 telemetry CDN URL。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        matchId: z.string().min(1).describe("对局 ID"),
        accountId: z
          .string()
          .optional()
          .describe("可选，聚焦玩家的 accountId"),
      }),
    },
    async ({ platform, matchId, accountId }) => {
      try {
        const { value: match, cached } = await getCachedMatch(platform, matchId);
        const focus =
          accountId == null
            ? null
            : (match.rosters
                .flatMap((r) => r.participants)
                .find((p) => p.accountId === accountId) ?? null);
        const telemetryStatus = await getTelemetryStatus(matchId);

        return textResult({
          ...match,
          telemetryUrl: undefined,
          hasTelemetryAsset: Boolean(match.telemetryUrl),
          telemetryStatus,
          focusAccountId: accountId ?? null,
          focusParticipant: focus,
          cached,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_match_report",
    {
      title: "对局复盘报告",
      description:
        "生成指定玩家在某场对局的复盘报告（含主因标签与摘要）。telemetry ready 时使用增强规则。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        matchId: z.string().min(1).describe("对局 ID"),
        accountId: z.string().min(1).describe("玩家 accountId"),
      }),
    },
    async ({ platform, matchId, accountId }) => {
      try {
        const { report, cached } = await buildMatchReport(
          platform,
          matchId,
          accountId,
        );
        return textResult({
          report,
          cached,
          ruleVersion: report.ruleVersion,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "compare_players",
    {
      title: "两人赛季对比",
      description: "对比两名玩家在同一平台/模式/赛季下的 KPI。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        nameA: z.string().min(1).describe("玩家 A 昵称"),
        nameB: z.string().min(1).describe("玩家 B 昵称"),
        gameMode: z.string().optional().describe("可选游戏模式"),
        seasonId: z.string().optional().describe("可选赛季 ID"),
      }),
    },
    async ({ platform, nameA, nameB, gameMode, seasonId }) => {
      try {
        if (nameA.toLowerCase() === nameB.toLowerCase()) {
          return errorResult(new Error("请输入两个不同的昵称"));
        }
        // 串行：避免同时打两次 search 顶满 RPM
        const a = await buildCompareSide(platform, nameA, { gameMode, seasonId });
        const b = await buildCompareSide(platform, nameB, { gameMode, seasonId });
        return textResult({
          platform,
          gameMode: gameMode ?? a.gameMode,
          seasonId: seasonId ?? null,
          players: [a, b],
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_player_form",
    {
      title: "玩家近况分析",
      description: "获取玩家近况 formStatus、异常 anomalies 与综合分（赛季 KPI vs 近 N 场）。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("游戏内昵称"),
        gameMode: z.string().optional().describe("可选游戏模式，如 squad-fpp"),
        seasonId: z.string().optional().describe("可选赛季 ID，默认当前赛季"),
        limit: z.number().int().min(1).max(20).optional().describe("近场样本上限，1-20，默认 20"),
      }),
    },
    async ({ platform, name, gameMode, seasonId, limit }) => {
      try {
        const data = await getPlayerFormAnalysis(platform, name, {
          gameMode,
          seasonId,
          limit: limit ?? 20,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_player_analysis",
    {
      title: "近 N 场报告聚合",
      description: "聚合近 N 场复盘：雷达分、弱点标签、主因与建议。range=20m|14d。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("游戏内昵称"),
        range: z.enum(["20m", "14d"]).optional().describe("分析窗口：20m=近20场，14d=近14天；默认 20m"),
      }),
    },
    async ({ platform, name, range }) => {
      try {
        const data = await getPlayerAnalysisByName(platform, name, {
          range: range ?? "20m",
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_squad_stats",
    {
      title: "车队同场统计",
      description: "统计主玩家与指定队友的同场对局聚合（齐全场 KPI、insights）。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("主玩家昵称"),
        mates: z.array(z.string().min(1)).optional().describe("队友昵称列表"),
        mateAccountIds: z.array(z.string().min(1)).optional().describe("队友 accountId 列表"),
        gameMode: z.string().optional().describe("可选游戏模式过滤"),
        limit: z.number().int().min(1).max(32).optional().describe("齐全对局样本上限，1-32，默认 20"),
        refresh: z.boolean().optional().describe("true 时绕过缓存强制重算"),
      }),
    },
    async ({ platform, name, mates, mateAccountIds, gameMode, limit, refresh }) => {
      try {
        if ((mates?.length ?? 0) === 0 && (mateAccountIds?.length ?? 0) === 0) {
          return errorResult(new Error("请至少指定 1 名队友（mates 或 mateAccountIds）"));
        }
        const data = await getSquadStats({
          platform,
          playerName: name,
          mateNames: mates,
          mateAccountIds,
          limit: limit ?? 20,
          gameMode,
          refresh,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "suggest_squad_mates",
    {
      title: "常一起队友建议",
      description: "扫描近 N 场，返回常一起开黑的 Top3 队友建议。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
        name: z.string().min(1).describe("主玩家昵称"),
        scan: z.number().int().min(1).max(32).optional().describe("扫描近场数，1-32，默认 12"),
      }),
    },
    async ({ platform, name, scan }) => {
      try {
        const data = await detectFrequentMates({
          platform,
          playerName: name,
          scan: scan ?? 12,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_player_weapons",
    {
      title: "武器/战斗聚合",
      description: "基于本地历史库聚合玩家武器击杀与战斗数据。",
      inputSchema: z.object({
        accountId: z.string().min(1).describe("玩家 accountId"),
        gameMode: z.string().optional().describe("可选游戏模式过滤"),
        limit: z.number().int().min(1).max(50).optional().describe("历史样本上限，1-50，默认 20"),
      }),
    },
    async ({ accountId, gameMode, limit }) => {
      try {
        const data = await getWeaponsTabData(accountId, {
          gameMode,
          limit: limit ?? 20,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_player_maps",
    {
      title: "地图聚合",
      description: "基于本地历史库按地图聚合场次、排名、KD、伤害与胜率。",
      inputSchema: z.object({
        accountId: z.string().min(1).describe("玩家 accountId"),
        gameMode: z.string().optional().describe("可选游戏模式过滤"),
        limit: z.number().int().min(1).max(100).optional().describe("历史样本上限，1-100，默认 50"),
      }),
    },
    async ({ accountId, gameMode, limit }) => {
      try {
        const data = await getMapsTabData(accountId, {
          gameMode,
          limit: limit ?? 50,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_seasons",
    {
      title: "赛季列表",
      description: "获取指定平台的赛季列表（含当前赛季标记）。",
      inputSchema: z.object({
        platform: platformSchema.describe("平台：steam / kakao / xbox / psn"),
      }),
    },
    async ({ platform }) => {
      try {
        const { value: seasons, cached } = await getCachedSeasons(platform);
        return textResult({ items: seasons, cached });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_player_history",
    {
      title: "本地历史库列表",
      description: "列出玩家本地已落盘的历史对局摘要（非官方实时列表）。",
      inputSchema: z.object({
        accountId: z.string().min(1).describe("玩家 accountId"),
        gameMode: z.string().optional().describe("可选游戏模式过滤"),
        limit: z.number().int().min(1).max(200).optional().describe("返回条数上限，1-200，默认 50"),
      }),
    },
    async ({ accountId, gameMode, limit }) => {
      try {
        const data = await listLocalHistory(accountId, {
          gameMode,
          limit: limit ?? 50,
        });
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
