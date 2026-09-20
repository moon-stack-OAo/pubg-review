import {
  AI_PROMPT_VERSION,
  getAiGatewayConfig,
  getAiRpm,
  isAiAnalysisEnabled,
} from "@/lib/ai/config";
import {chatCompletions} from "@/lib/ai/client";
import {
  readAiExplainCache,
  writeAiExplainCache,
  type PersistedAiExplain,
} from "@/lib/ai/cache";
import {
  buildMatchUserPrompt,
  MATCH_SYSTEM_PROMPT,
  parseAiJsonContent,
} from "@/lib/ai/prompts";
import {sanitizeMatchReport} from "@/lib/ai/sanitize";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {BizError} from "@/lib/errors";
import {consumeRateLimit} from "@/lib/rate-limit";
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

/** 供 UI/SSR：是否展示 AI 区块（仅开关；有无 Key 由接口降级） */
export function shouldShowAiUi(): boolean {
  return isAiAnalysisEnabled();
}
