"use client";

import { Button, EmptyState } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="pt-10">
      <EmptyState
        title="Something went wrong loading practice"
        action={<Button onClick={reset}>Try again</Button>}
      >
        Answers you&apos;ve already submitted are saved.
      </EmptyState>
    </div>
  );
}
