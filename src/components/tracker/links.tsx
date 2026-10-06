"use client";

// Navigation inside the tracker. On the student's own pages these are real links to the other
// tabs; in the teacher's read-only view they switch the in-page tab instead (or render as plain text).
import Link from "next/link";
import type { ReactNode } from "react";
import { filterToQuery, type ChapterFilter } from "@/lib/tracker-view";

export type TrackerTab = "overview" | "chapters" | "hours" | "mocks";
export type OnTab = (tab: TrackerTab, filter?: Partial<ChapterFilter>) => void;

const PATHS: Record<TrackerTab, string> = {
  overview: "/student",
  chapters: "/student/chapters",
  hours: "/student/hours",
  mocks: "/student/mocks",
};

export function tabHref(tab: TrackerTab, filter?: Partial<ChapterFilter>): string {
  const qs = filter ? filterToQuery({ query: "", topicId: "", status: "all", ...filter }) : "";
  return qs ? `${PATHS[tab]}?${qs}` : PATHS[tab];
}

export const practiceHref = (target: { moduleId?: string; scope?: "weak" | "mixed" }) =>
  target.moduleId ? `/student/practice?module=${target.moduleId}` : `/student/practice?scope=${target.scope ?? "weak"}`;

/** A link to another tab: <Link> for the student, a button that switches tabs in read-only mode. */
export function TabLink({
  tab,
  filter,
  readOnly,
  onTab,
  className,
  children,
  ...rest
}: {
  tab: TrackerTab;
  filter?: Partial<ChapterFilter>;
  readOnly: boolean;
  onTab?: OnTab;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  if (!readOnly) return <Link href={tabHref(tab, filter)} className={className} {...rest}>{children}</Link>;
  if (!onTab) return <span className={className}>{children}</span>;
  return (
    <button type="button" onClick={() => onTab(tab, filter)} className={className} {...rest}>
      {children}
    </button>
  );
}
