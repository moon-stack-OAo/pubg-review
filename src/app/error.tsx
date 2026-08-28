"use client";

import {useEffect} from "react";
import {Card, PageShell} from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <PageShell>
      <Card className="border-rose-900/60 bg-rose-950/20">
        <p className="font-medium text-rose-200">页面出错了</p>
        <p className="mt-1 text-sm text-rose-300/90">
          {error.message || "未知错误，请稍后重试"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:border-amber-500/50 hover:text-amber-200"
        >
          重试
        </button>
      </Card>
    </PageShell>
  );
}
