import {Card} from "@/components/ui";
import {getBanStatusView} from "@/lib/pubg/ban";
import type {PubgBanType} from "@/lib/pubg/types";

const TONE_CLASS: Record<string, string> = {
  ok: "border-emerald-800/60 bg-emerald-950/30 text-emerald-300",
  warn: "border-amber-800/60 bg-amber-950/30 text-amber-300",
  bad: "border-rose-800/60 bg-rose-950/30 text-rose-300",
  unknown: "border-zinc-700 bg-zinc-900/50 text-zinc-300",
};

export function BanStatusCard({
  banType,
  checkedAt,
}: {
  banType: PubgBanType;
  checkedAt?: string;
}) {
  const view = getBanStatusView(banType);

  return (
    <Card className={TONE_CLASS[view.tone] ?? TONE_CLASS.unknown}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs opacity-80">账号封禁状态（官方）</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{view.label}</p>
          <p className="mt-2 text-sm opacity-90">{view.description}</p>
        </div>
        <div className="text-right text-xs opacity-70">
          <div>banType: {view.banType}</div>
          {checkedAt ? <div className="mt-1">查询：{checkedAt}</div> : null}
        </div>
      </div>
      <p className="mt-3 text-xs opacity-70">
        说明：本站只展示 PUBG 官方 API 的封禁字段，不做「是否开挂」推断，也不替代 BattlEye / Steam
        VAC 检测。
      </p>
    </Card>
  );
}
