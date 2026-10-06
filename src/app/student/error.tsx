"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

export default function StudentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
      <p className="font-semibold text-ink">Something went wrong loading this page.</p>
      <p className="mt-1 text-sm text-ink-2">Your progress is safe. Try again, or head back to today.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <ButtonLink href="/student" variant="secondary">
          Today
        </ButtonLink>
      </div>
    </div>
  );
}
