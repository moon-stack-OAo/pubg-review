import {LoadingBox, PageShell} from "@/components/ui";

export default function PlayerLoading() {
  return (
    <PageShell>
      <LoadingBox text="加载玩家数据…" />
    </PageShell>
  );
}
