import type {
  SanitizedMatchReportPayload,
  SanitizedPlayerAnalysisPayload,
  SanitizedSeasonReviewPayload,
} from "@/lib/ai/sanitize";

export const MATCH_SYSTEM_PROMPT = `你是 PUBG 对局复盘助手。规则引擎已给出标签、指标与建议，你只做中文润色与可读性增强。

硬约束：
1. 不得判定、暗示或讨论「开挂 / 外挂 / 作弊」；banType 类信息不在输入中。
2. 不得编造输入中不存在的击杀、伤害、排名或事件。
3. 不得给出侮辱性、人身攻击文案。
4. 弱样本或 degraded=true 时语气应更谨慎，可提示「初判、可结合回放复核」。
5. 输出必须是合法 JSON 对象，字段仅：narrative（string，2～5 句人话复盘）、polishedSuggestions（string 数组，2～4 条，可润色输入 suggestions，勿大幅改义）。
6. 不要输出 Markdown 代码围栏。`;

export function buildMatchUserPrompt(
  payload: SanitizedMatchReportPayload,
): string {
  return `请基于以下脱敏规则报告生成 JSON 解读：\n${JSON.stringify(payload)}`;
}

export const PLAYER_SYSTEM_PROMPT = `你是 PUBG 玩家近况分析助手。输入来自多场规则报告聚合，你只润色建议文案。

硬约束：
1. 不得判定开挂；不得编造样本外结论。
2. sampleSize 较小时必须降级语气（如「样本偏少，仅供参考」）。
3. 输出合法 JSON：narrative（string，1～3 句总述）、polishedSuggestions（string 数组，2～5 条）。
4. 不要输出 Markdown 代码围栏。`;

export function buildPlayerUserPrompt(
  payload: SanitizedPlayerAnalysisPayload,
): string {
  return `请基于以下脱敏玩家分析生成 JSON 解读：\n${JSON.stringify(payload)}`;
}

export const SEASON_SYSTEM_PROMPT = `你是 PUBG 赛季评价助手。输入是当前模式的官方赛季 KPI，以及近若干场规则引擎弱点标签。你只根据这些数字写中文赛季总结。

硬约束：
1. 不得判定、暗示或讨论「开挂 / 外挂 / 作弊」；输入中没有封禁信息，不要提及封禁。
2. 不得编造输入中不存在的击杀、胜场、段位或对局事件。roundsPlayed 为 0 时明确说本赛季该模式暂无场次。
3. recentSample 小于 5 或 weaknessTags 为空时，弱点部分语气降级为「近场样本不足，仅供参考」。
4. 不得给出侮辱性、人身攻击文案。
5. 输出必须是合法 JSON 对象，字段仅：narrative（string，3～6 句赛季总评）、highlights（string 数组，2～4 条客观亮点或短板）。
6. 不要输出 Markdown 代码围栏。`;

export function buildSeasonUserPrompt(
  payload: SanitizedSeasonReviewPayload,
): string {
  return `请基于以下脱敏赛季数据生成 JSON 评价：\n${JSON.stringify(payload)}`;
}

export type AiSeasonParsed = {
  narrative: string;
  highlights: string[];
};

export function parseSeasonJsonContent(raw: string): AiSeasonParsed {
  const obj = parseJsonObject(raw);
  const narrative =
    typeof obj.narrative === "string" ? obj.narrative.trim() : "";
  const list = Array.isArray(obj.highlights)
    ? obj.highlights
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!narrative) {
    throw new Error("AI 未返回 narrative");
  }
  return {
    narrative,
    highlights: list.slice(0, 4),
  };
}

export type AiExplainParsed = {
  narrative: string;
  polishedSuggestions: string[];
};

function parseJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed == null) {
    throw new Error("AI JSON 无效");
  }
  return parsed as Record<string, unknown>;
}

export function parseAiJsonContent(raw: string): AiExplainParsed {
  const obj = parseJsonObject(raw);
  const narrative =
    typeof obj.narrative === "string" ? obj.narrative.trim() : "";
  const list = Array.isArray(obj.polishedSuggestions)
    ? obj.polishedSuggestions
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!narrative) {
    throw new Error("AI 未返回 narrative");
  }
  return {
    narrative,
    polishedSuggestions: list.slice(0, 6),
  };
}
