import {
  AI_PROMPT_VERSION,
  getAiGatewayConfig,
  getAiRpm,
  isAiAnalysisEnabled,
} from "@/lib/ai/config";
import {chatCompletions} from "@/lib/ai/client";
import {
  readAiExplainCache,
  readSeasonReviewCache,
  writeAiExplainCache,
  writeSeasonReviewCache,
  type PersistedAiExplain,
  type PersistedSeasonReview,
} from "@/lib/ai/cache";
import {
  buildMatchUserPrompt,
  buildSeasonUserPrompt,
  MATCH_SYSTEM_PROMPT,
  parseAiJsonContent,
  parseSeasonJsonContent,
  SEASON_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import {
  sanitizeMatchReport,
  sanitizeSeasonReview,
  type SanitizedSeasonReviewPayload,
} from "@/lib/ai/sanitize";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {BizError} from "@/lib/errors";
import {consumeRateLimit} from "@/lib/rate-limit";
import {getPlayerDashboard} from "@/lib/pubg/service";
import type {PubgPlatform} from "@/lib/pubg/types";

const inflight = new Map<string, Promise<AiMatchExplainResult>>();

export type AiMatchExplainResult = {
  enabled: true;
  cached: boolean;
  matchId: string;
  accountId: string;
  ruleVersion: string;
  promptVersion: string;
  model: string;
  narrative: string;
  polishedSuggestions: string[];
  /** 规则引擎原文，供 UI 降级对照 */
  ruleSummaryLines: string[];
  ruleSuggestions: string[];
  disclaimer: string;
  generatedAt: string;
};

export const AI_DISCLAIMER = "AI 辅助，非官方判定";

function cacheKey(
  matchId: string,
  accountId: string,
  ruleVersion: string,
): string {
  return `${matchId}:${accountId}:${ruleVersion}:${AI_PROMPT_VERSION}`;
}

/**
 * 生成单场 AI 解读。默认关闭；无 Key → 503；限流 → 429。
 * 不修改规则引擎报告。
 */
export async function explainMatchReport(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  options?: { force?: boolean },
): Promise<AiMatchExplainResult> {
  if (!isAiAnalysisEnabled()) {
    throw new BizError("AI 分析未开启", 404, 40403);
  }

  const gateway = getAiGatewayConfig();
  if (!gateway) {
    throw new BizError(
      "已开启 AI 分析，但未配置 AI_API_KEY",
      503,
      50301,
    );
  }

  const { report } = await buildMatchReport(platform, matchId, accountId);
  const key = cacheKey(matchId, accountId, report.ruleVersion);

  if (!options?.force) {
    const disk = await readAiExplainCache(
      matchId,
      accountId,
      report.ruleVersion,
      AI_PROMPT_VERSION,
    );
    if (disk) {
      return toResult(disk, report.summaryLines, report.suggestions, true);
    }
  }

  const running = inflight.get(key);
  if (running) return running;

  const job = (async (): Promise<AiMatchExplainResult> => {
    const rl = consumeRateLimit("ai:global", { rpm: getAiRpm() });
    if (!rl.ok) {
      throw new BizError(
        `AI 调用过于频繁，请 ${rl.retryAfterSec} 秒后再试`,
        429,
        42902,
        { retryAfterSec: rl.retryAfterSec, limit: rl.limit },
      );
    }

    const payload = sanitizeMatchReport(report);
    const { content, model } = await chatCompletions(
      gateway,
      [
        { role: "system", content: MATCH_SYSTEM_PROMPT },
        { role: "user", content: buildMatchUserPrompt(payload) },
      ],
      { temperature: 0.35, maxTokens: 700 },
    );

    const parsed = parseAiJsonContent(content);
    const saved: PersistedAiExplain = {
      savedAt: new Date().toISOString(),
      matchId: report.matchId,
      accountId: report.accountId,
      ruleVersion: report.ruleVersion,
      promptVersion: AI_PROMPT_VERSION,
      model,
      narrative: parsed.narrative,
      polishedSuggestions:
        parsed.polishedSuggestions.length > 0
          ? parsed.polishedSuggestions
          : report.suggestions.slice(0, 4),
    };

    try {
      await writeAiExplainCache(saved);
    } catch {
      // 落盘失败仍返回
    }

    return toResult(saved, report.summaryLines, report.suggestions, false);
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

function toResult(
  disk: PersistedAiExplain,
  ruleSummaryLines: string[],
  ruleSuggestions: string[],
  cached: boolean,
): AiMatchExplainResult {
  return {
    enabled: true,
    cached,
    matchId: disk.matchId,
    accountId: disk.accountId,
    ruleVersion: disk.ruleVersion,
    promptVersion: disk.promptVersion,
    model: disk.model,
    narrative: disk.narrative,
    polishedSuggestions: disk.polishedSuggestions,
    ruleSummaryLines,
    ruleSuggestions,
    disclaimer: AI_DISCLAIMER,
    generatedAt: disk.savedAt,
  };
}

export type AiSeasonReviewResult = {
  enabled: true;
  cached: boolean;
  stale: boolean;
  accountId: string;
  platform: string;
  seasonId: string;
  gameMode: string | null;
  promptVersion: string;
  model: string;
  narrative: string;
  highlights: string[];
  disclaimer: string;
  generatedAt: string;
};

const seasonInflight = new Map<string, Promise<AiSeasonReviewResult>>();

function seasonFingerprint(payload: SanitizedSeasonReviewPayload): string {
  return JSON.stringify(payload);
}

function seasonCacheKey(
  accountId: string,
  seasonId: string,
  gameMode: string,
): string {
  return `${accountId}:${seasonId}:${gameMode}:${AI_PROMPT_VERSION}`;
}

/**
 * 赛季评价：基于当前模式 KPI + 近场弱点标签。默认关闭；无 Key → 503。
 * GET 只读缓存；此处 POST 才外呼。fingerprint 变化时标记 stale，不自动重算。
 */
export async function reviewPlayerSeason(
  platform: PubgPlatform,
  name: string,
  options?: { seasonId?: string; gameMode?: string; force?: boolean },
): Promise<AiSeasonReviewResult> {
  if (!isAiAnalysisEnabled()) {
    throw new BizError("AI 分析未开启", 404, 40403);
  }
  const gateway = getAiGatewayConfig();
  if (!gateway) {
    throw new BizError("已开启 AI 分析，但未配置 AI_API_KEY", 503, 50301);
  }

  const dashboard = await getPlayerDashboard(platform, name, {
    seasonId: options?.seasonId,
    gameMode: options?.gameMode,
    recentLimit: 8,
  });
  const gameMode = dashboard.season.selectedGameMode ?? "";
  const payload = sanitizeSeasonReview({
    platform,
    seasonId: dashboard.season.seasonId,
    gameMode: gameMode || null,
    stats: dashboard.selectedStats,
    recentSample: dashboard.recentMatches.length,
    weaknessTags: dashboard.weaknessTags,
  });
  const fingerprint = seasonFingerprint(payload);
  const accountId = dashboard.player.accountId;
  const key = seasonCacheKey(accountId, payload.seasonId, gameMode);

  if (!options?.force) {
    const disk = await readSeasonReviewCache(
      accountId,
      payload.seasonId,
      gameMode,
      AI_PROMPT_VERSION,
    );
    if (disk) {
      return toSeasonResult(disk, true, disk.fingerprint !== fingerprint);
    }
  }

  const running = seasonInflight.get(key);
  if (running) return running;

  const job = (async (): Promise<AiSeasonReviewResult> => {
    const rl = consumeRateLimit("ai:global", { rpm: getAiRpm() });
    if (!rl.ok) {
      throw new BizError(
        `AI 调用过于频繁，请 ${rl.retryAfterSec} 秒后再试`,
        429,
        42902,
        { retryAfterSec: rl.retryAfterSec, limit: rl.limit },
      );
    }

    const { content, model } = await chatCompletions(
      gateway,
      [
        { role: "system", content: SEASON_SYSTEM_PROMPT },
        { role: "user", content: buildSeasonUserPrompt(payload) },
      ],
      { temperature: 0.4, maxTokens: 800 },
    );
    const parsed = parseSeasonJsonContent(content);
    const saved: PersistedSeasonReview = {
      savedAt: new Date().toISOString(),
      accountId,
      platform,
      seasonId: payload.seasonId,
      gameMode,
      promptVersion: AI_PROMPT_VERSION,
      model,
      narrative: parsed.narrative,
      highlights: parsed.highlights,
      fingerprint,
    };
    try {
      await writeSeasonReviewCache(saved);
    } catch {
      // 落盘失败仍返回
    }
    return toSeasonResult(saved, false, false);
  })();

  seasonInflight.set(key, job);
  try {
    return await job;
  } finally {
    if (seasonInflight.get(key) === job) seasonInflight.delete(key);
  }
}

function toSeasonResult(
  disk: PersistedSeasonReview,
  cached: boolean,
  stale: boolean,
): AiSeasonReviewResult {
  return {
    enabled: true,
    cached,
    stale,
    accountId: disk.accountId,
    platform: disk.platform,
    seasonId: disk.seasonId,
    gameMode: disk.gameMode || null,
    promptVersion: disk.promptVersion,
    model: disk.model,
    narrative: disk.narrative,
    highlights: disk.highlights,
    disclaimer: AI_DISCLAIMER,
    generatedAt: disk.savedAt,
  };
}

/** 供 UI/SSR：是否展示 AI 区块（仅开关；有无 Key 由接口降级） */
export function shouldShowAiUi(): boolean {
  return isAiAnalysisEnabled();
}
