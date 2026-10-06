"use client";

import { useEffect } from "react";
import { Button, ButtonLink, EmptyState } from "@/components/ui";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-10" role="alert">
      <EmptyState
        title="This page didn't load"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/student" variant="secondary">
              Back to overview
            </ButtonLink>
          </div>
        }
      >
        Something went wrong on our side. Your progress is safe.{" "}
        {error.digest && (
          <span className="block text-xs text-ink-3">
            Reference: {error.digest}
          </span>
        )}
      </EmptyState>
    </div>
  );
}
