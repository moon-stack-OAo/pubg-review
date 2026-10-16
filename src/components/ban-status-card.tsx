import {Card} from "@/components/ui";
import {getBanStatusView} from "@/lib/pubg/ban";
import type {PubgBanType} from "@/lib/pubg/types";

const TONE_CLASS: Record<string, string> = {
  ok: "border-success/40 bg-success-muted text-success",
  warn: "border-warning/40 bg-warning-muted text-warning",
  bad: "border-danger/40 bg-danger-muted text-danger",
  unknown: "border-border-strong bg-surface-2 text-fg-secondary",
};

export function BanStatusCard({
  banType,
  checkedAt,
}: {
  banType: PubgBanType;
  checkedAt?: string;
}) {
  const view = getBanStatusView(banType);
  const isNormal = view.tone === "ok";

  return (
    <Card className={TONE_CLASS[view.tone] ?? TONE_CLASS.unknown}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {isNormal ? (
            <p className="text-sm">
              账号封禁状态（官方）：<span className="font-semibold">{view.label}</span>
            </p>
          ) : (
            <>
              <p className="text-xs opacity-80">账号封禁状态（官方）</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{view.label}</p>
              <p className="mt-2 text-sm opacity-90">{view.description}</p>
            </>
          )}
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium">状态详情与说明</summary>
        {isNormal ? <p className="mt-2 opacity-90">{view.description}</p> : null}
        <div className="mt-2 opacity-70">
          <div>banType: {view.banType}</div>
          {checkedAt ? <div className="mt-1">查询：{checkedAt}</div> : null}
        </div>
        <p className="mt-2 opacity-70">
          说明：本站只展示 PUBG 官方 API 的封禁字段，不做「是否开挂」推断，也不替代 BattlEye / Steam
          VAC 检测。
        </p>
      </details>
    </Card>
  );
}
