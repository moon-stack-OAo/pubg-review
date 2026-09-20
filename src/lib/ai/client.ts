import type {AiGatewayConfig} from "@/lib/ai/config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiChatResult = {
  content: string;
  model: string;
};

/**
 * OpenAI-compatible Chat Completions（原生 fetch，无额外 SDK）。
 */
export async function chatCompletions(
  config: AiGatewayConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<AiChatResult> {
  const temperature = options?.temperature ?? 0.4;
  const maxTokens = options?.maxTokens ?? 600;
  const timeoutMs = options?.timeoutMs ?? 45_000;

  const url = `${config.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const errMsg =
        typeof json === "object" &&
        json != null &&
        "error" in json &&
        typeof (json as { error?: { message?: string } }).error?.message ===
          "string"
          ? (json as { error: { message: string } }).error.message
          : `AI 网关 HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const content =
      typeof json === "object" &&
      json != null &&
      "choices" in json &&
      Array.isArray((json as { choices: unknown }).choices)
        ? String(
            (
              (json as { choices: Array<{ message?: { content?: string } }> })
                .choices[0]?.message?.content ?? ""
            ).trim(),
          )
        : "";

    if (!content) {
      throw new Error("AI 返回为空");
    }

    return { content, model: config.model };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("AI 请求超时");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
