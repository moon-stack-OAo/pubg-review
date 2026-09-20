/** AI 可选增强：默认关闭；密钥仅服务端。 */

export const AI_PROMPT_VERSION = "1.0.0";

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(raw ?? "");
}

export function isAiAnalysisEnabled(): boolean {
  return envFlag("AI_ANALYSIS_ENABLED");
}

export type AiGatewayConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * 仅在开关开启且配置了 Key 时返回网关；否则 null。
 * baseUrl 默认 OpenAI 兼容根路径（不含 /chat/completions）。
 */
export function getAiGatewayConfig(): AiGatewayConfig | null {
  if (!isAiAnalysisEnabled()) return null;
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  if (!apiKey) return null;
  const baseUrl = (
    process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

/** 进程内 AI 调用 RPM（与官方 PUBG RPM 无关） */
export function getAiRpm(): number {
  const raw = Number(process.env.AI_RATE_LIMIT_RPM ?? "6");
  if (!Number.isFinite(raw) || raw <= 0) return 6;
  return Math.min(Math.max(Math.floor(raw), 1), 60);
}
