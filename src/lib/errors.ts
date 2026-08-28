import {PubgApiError} from "@/lib/pubg/client";

export class BizError extends Error {
  status: number;
  code: number;
  meta?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = 40001,
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BizError";
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

/** 统一友好中文错误文案（页面与 API 共用） */
export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof BizError) {
    if (error.code === 40901) {
      const retry =
        typeof error.meta?.retryAfterSec === "number"
          ? error.meta.retryAfterSec
          : null;
      return retry != null
        ? `刷新冷却中，请 ${retry} 秒后再试`
        : "刷新冷却中，请稍后再试";
    }
    if (error.code === 42902) {
      const retry =
        typeof error.meta?.retryAfterSec === "number"
          ? error.meta.retryAfterSec
          : null;
      return retry != null
        ? `请求过于频繁，请 ${retry} 秒后再试`
        : "请求过于频繁，请稍后再试";
    }
    return error.message;
  }

  if (error instanceof PubgApiError) {
    if (error.status === 404) {
      if (error.message.includes("对局")) {
        return "对局不存在或已过期（官方约保留 14 天）";
      }
      return "未找到玩家，请检查平台与昵称大小写是否与游戏内完全一致";
    }
    if (error.status === 429) {
      const retry = error.retryAfterSec;
      return retry != null
        ? `查询拥挤（官方限流），请约 ${retry} 秒后再试`
        : "查询拥挤（官方限流），请稍后再试";
    }
    if (error.status >= 500) {
      return "PUBG 官方接口异常，请稍后重试";
    }
    if (error.status === 401 || error.status === 403) {
      return "官方接口鉴权失败，请检查服务端配置";
    }
    return "请求失败，请稍后重试";
  }

  console.error("[friendlyErrorMessage]", error);
  return "服务暂时不可用";
}

export const EMPTY_RECENT_MATCHES =
  "近 14 天暂无对局记录。官方玩家资料仅保留约两周内的对局列表；收藏同步能力将在后续里程碑提供。";
