"use client";

import Link from "next/link";
import { Timer } from "lucide-react";
import { formatClock } from "@/lib/focus-timer";
import { useFocusTimer } from "./use-focus-timer";

/** Appears on other tracker pages while a focus timer is running or paused, and links to it. */
export function TimerChip() {
  const { state, mounted, elapsedMs } = useFocusTimer();
  if (!mounted || state.status === "idle") return null;
  return (
    <Link
      href="/student/hours"
      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-brand/50 bg-brand-soft px-3 py-1 text-sm font-semibold text-brand max-sm:min-h-11"
    >
      <Timer aria-hidden className="size-4" />
      <span>Focus timer {state.status === "running" ? "running" : "paused"}</span>
      <span className="tabular">{formatClock(elapsedMs)}</span>
    </Link>
  );
}
