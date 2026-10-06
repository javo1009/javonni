"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

/** Copies text to the clipboard and announces the result politely. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <>
      <button type="button" onClick={copy} className={buttonClass("secondary", "sm", className)} aria-label={label}>
        {state === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {state === "copied" ? "Copied" : "Copy"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Couldn't copy. Select the text and copy it manually." : ""}
      </span>
    </>
  );
}
