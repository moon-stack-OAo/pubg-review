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
      <Card className="border-danger/40 bg-danger-muted">
        <p className="font-medium text-danger">页面出错了</p>
        <p className="mt-1 text-sm text-danger">
          {error.message || "未知错误，请稍后重试"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent-border hover:text-accent"
        >
          重试
        </button>
      </Card>
    </PageShell>
  );
}
