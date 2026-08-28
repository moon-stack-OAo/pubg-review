import {LoadingBox, PageShell} from "@/components/ui";

export default function MatchLoading() {
  return (
    <PageShell>
      <LoadingBox text="加载对局…" />
    </PageShell>
  );
}
