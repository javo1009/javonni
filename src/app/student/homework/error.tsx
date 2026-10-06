"use client";

import { Button, EmptyState } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="pt-10">
      <EmptyState title="Something went wrong loading your homework" action={<Button onClick={reset}>Try again</Button>}>
        Your answers and files are saved. Try again in a moment.
      </EmptyState>
    </div>
  );
}
