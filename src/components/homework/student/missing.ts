// "What's left before I can hand in?" for the sticky bar. Pure, so it is easy to test.

import type { ItemKind } from "./due";

export type WorkItem = { id: string; kind: ItemKind; prompt?: string | null };
export type WorkAnswers = Record<
  string,
  { chosenKey?: string | null; textAnswer?: string | null } | undefined
>;

export type Missing = {
  /** Things that stop the hand-in (the service refuses without them). */
  blocking: string[];
  /** Things worth a heads-up but allowed (unanswered questions score nothing). */
  warnings: string[];
  unanswered: number;
  filesMissing: number;
  ready: boolean;
};

export function computeMissing(
  items: WorkItem[],
  answers: WorkAnswers,
  fileCounts: Record<string, number>,
): Missing {
  const fileItems = items.filter((i) => i.kind === "file");
  const filesMissing = fileItems.filter(
    (i) => (fileCounts[i.id] ?? 0) === 0,
  ).length;
  const unanswered = items.filter((i) => {
    const a = answers[i.id];
    if (i.kind === "mcq") return !a?.chosenKey;
    if (i.kind === "text") return !a?.textAnswer?.trim();
    return false;
  }).length;

  const blocking: string[] = [];
  if (filesMissing > 0)
    blocking.push(
      fileItems.length === 1
        ? "Upload your work"
        : `Upload your work (${filesMissing} of ${fileItems.length} still empty)`,
    );
  const warnings: string[] = [];
  if (unanswered > 0)
    warnings.push(
      `${unanswered} ${unanswered === 1 ? "question" : "questions"} unanswered`,
    );
  return {
    blocking,
    warnings,
    unanswered,
    filesMissing,
    ready: blocking.length === 0,
  };
}
