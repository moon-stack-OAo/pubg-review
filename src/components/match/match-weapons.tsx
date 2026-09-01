import Link from "next/link";
import {Card} from "@/components/ui";
import {aggregateWeaponsFromTelemetry} from "@/lib/history/aggregate";
import {readParsedEvents} from "@/lib/telemetry/storage";

export async function MatchWeaponsPanel({
  matchId,
  platform,
  accountId,
  playerName,
  telemetryStatus,
}: {
  matchId: string;
  platform: string;
  accountId?: string;
  playerName?: string;
  telemetryStatus: string;
}) {
  const timelineQs = new URLSearchParams({ platform, tab: "timeline" });
  if (accountId) timelineQs.set("accountId", accountId);
  if (playerName) timelineQs.set("name", playerName);
  const timelineHref = `/match/${matchId}?${timelineQs.toString()}`;

  if (telemetryStatus !== "ready") {
    return (
      <Card>
        <h2 className="font-medium">本场武器</h2>
        <p className="mt-2 text-sm text-zinc-500">
          遥测尚未就绪，无法统计本场武器击杀/倒地。
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          <Link href={timelineHref} className="text-amber-300 hover:underline">
            打开事件轴
          </Link>
          或回放以触发解析，完成后再回来查看。
        </p>
      </Card>
    );
  }

  if (!accountId) {
    return (
      <Card>
        <h2 className="font-medium">本场武器</h2>
        <p className="mt-2 text-sm text-zinc-500">
          请从玩家页进入（带 accountId）以查看个人本场武器统计。
        </p>
      </Card>
    );
  }

  const parsed = await readParsedEvents(matchId);
  if (!parsed) {
    return (
      <Card>
        <h2 className="font-medium">本场武器</h2>
        <p className="mt-2 text-sm text-zinc-500">
          遥测标记为就绪，但暂无解析事件。
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          可尝试
          <Link href={timelineHref} className="text-amber-300 hover:underline">
            打开事件轴
          </Link>
          重新触发解析。
        </p>
      </Card>
    );
  }

  const weapons = aggregateWeaponsFromTelemetry([parsed], accountId);
  if (weapons.length === 0) {
    return (
      <Card>
        <h2 className="font-medium">本场武器</h2>
        <p className="mt-2 text-sm text-zinc-500">
          暂无本场武器击杀/倒地。
        </p>
      </Card>
    );
  }

  const maxScore = Math.max(1, ...weapons.map((w) => w.kills + w.knocks));

  return (
    <Card>
      <h2 className="mb-3 font-medium">本场武器</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">武器</th>
              <th className="px-2 py-2 font-medium">击杀</th>
              <th className="px-2 py-2 font-medium">倒地</th>
              <th className="px-2 py-2 font-medium w-40">占比</th>
            </tr>
          </thead>
          <tbody>
            {weapons.map((w) => {
              const score = w.kills + w.knocks;
              const pct = Math.min(100, (score / maxScore) * 100);
              return (
                <tr
                  key={w.weaponId}
                  className="border-t border-zinc-800/80"
                >
                  <td className="px-2 py-2 text-zinc-200">{w.label}</td>
                  <td className="px-2 py-2">{w.kills}</td>
                  <td className="px-2 py-2">{w.knocks}</td>
                  <td className="px-2 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
