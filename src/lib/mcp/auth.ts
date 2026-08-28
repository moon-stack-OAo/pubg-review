import {timingSafeEqual} from "node:crypto";

export function isMcpEnabled() {
  const raw = process.env.MCP_ENABLED?.trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(raw ?? "");
}

export function getMcpToken() {
  const token = process.env.MCP_TOKEN?.trim();
  return token ? token : null;
}

function safeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function extractBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (header == null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match == null) {
    return null;
  }
  const token = match[1]?.trim();
  return token ? token : null;
}

export type McpAuthFailure =
  | {ok: false; status: 401; code: "unauthorized"}
  | {ok: false; status: 503; code: "token_not_configured"}
  | {ok: true};

export function authorizeMcpRequest(request: Request): McpAuthFailure {
  const expected = getMcpToken();
  if (expected == null) {
    return {ok: false, status: 503, code: "token_not_configured"};
  }
  const provided = extractBearerToken(request);
  if (provided == null || !safeEqualString(provided, expected)) {
    return {ok: false, status: 401, code: "unauthorized"};
  }
  return {ok: true};
}

export function mcpAuthErrorResponse(failure: Exclude<McpAuthFailure, {ok: true}>) {
  if (failure.code === "token_not_configured") {
    return Response.json(
      {
        error: "MCP token not configured",
        message: "已开启 MCP，但未配置 MCP_TOKEN",
      },
      {status: 503},
    );
  }
  return Response.json(
    {
      error: "unauthorized",
      message: "需要 Authorization: Bearer <MCP_TOKEN>",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="pubg-review-mcp", error="invalid_token"',
      },
    },
  );
}
