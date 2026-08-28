import {buildMatchReport} from "@/lib/analysis/report-service";
import {friendlyErrorMessage} from "@/lib/errors";
import {buildCompareSide} from "@/lib/history/service";
import {getCachedMatch, getCachedPlayer, getPlayerDashboard,} from "@/lib/pubg/service";
import {PUBG_PLATFORMS, type PubgPlatform} from "@/lib/pubg/types";
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
}
