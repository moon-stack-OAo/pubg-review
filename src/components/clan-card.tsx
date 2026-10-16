import {Card} from "@/components/ui";
import {friendlyErrorMessage} from "@/lib/errors";
import {getCachedClan} from "@/lib/pubg/service";
import type {PubgPlatform} from "@/lib/pubg/types";

export async function ClanCard({
  platform,
  clanId,
}: {
  platform: PubgPlatform;
  clanId: string;
}) {
  let clan = null;
  let error: string | null = null;
  try {
    const result = await getCachedClan(platform, clanId);
    clan = result.value;
  } catch (e) {
    error = friendlyErrorMessage(e);
  }

  if (!clan && !error) return null;

  return (
    <Card>
      <p className="text-xs text-fg-secondary">战队（官方）</p>
      {clan ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-xl font-semibold tracking-tight">
            {clan.clanTag ? `[${clan.clanTag}] ` : ""}
            {clan.clanName || "未命名战队"}
          </p>
          <p className="text-sm text-fg-secondary">
            Lv.{clan.clanLevel} · {clan.clanMemberCount} 人
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-fg-secondary">{error}</p>
      )}
    </Card>
  );
}
