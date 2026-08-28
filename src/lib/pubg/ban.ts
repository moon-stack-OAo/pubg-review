import type {PubgBanType} from "@/lib/pubg/types";

export type BanStatusView = {
  banType: PubgBanType;
  label: string;
  description: string;
  tone: "ok" | "warn" | "bad" | "unknown";
};

export function getBanStatusView(banType: PubgBanType | undefined | null): BanStatusView {
  switch (banType) {
    case "Innocent":
      return {
        banType,
        label: "正常",
        description: "官方账号状态为未封禁（Innocent）。这不代表「从未开挂」，仅表示当前无 PUBG 封禁记录。",
        tone: "ok",
      };
    case "TemporaryBan":
      return {
        banType,
        label: "临时封禁",
        description: "官方账号状态为临时封禁（TemporaryBan）。来源为 PUBG Developer API，非本站判定。",
        tone: "warn",
      };
    case "PermanentBan":
      return {
        banType,
        label: "永久封禁",
        description: "官方账号状态为永久封禁（PermanentBan）。来源为 PUBG Developer API，非本站判定。",
        tone: "bad",
      };
    default:
      return {
        banType: "Unknown",
        label: "未知",
        description: "未返回 banType 或字段无法识别。请刷新玩家数据后重试。",
        tone: "unknown",
      };
  }
}
