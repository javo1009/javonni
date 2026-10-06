import { Check, CircleHelp, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { getAssignmentForStudent } from "@/services/homework";
import { FileLinks } from "./file-links";

type Data = Awaited<ReturnType<typeof getAssignmentForStudent>>;
type Item = Data["items"][number];

const KIND_LABEL = {
  mcq: "Multiple choice",
  text: "Written answer",
  file: "File upload",
} as const;

function answersNote(
  policy: Data["assignment"]["policies"]["showAnswers"],
  dueAt: Date,
  now: Date,
) {
  if (policy === "never")
    return "Your teacher hasn't made the correct answers visible for this homework.";
  if (policy === "after_due" && dueAt > now)
    return "The correct answers will appear after the due date.";
  return null;
}

/** What the student handed in, item by item. `graded` adds marks and feedback; correct answers follow the teacher's policy. */
export function ReviewItems({
  data,
  graded,
  now,
}: {
  data: Data;
  graded: boolean;
  now: Date;
}) {
  const note = answersNote(
    data.assignment.policies.showAnswers,
    data.assignment.dueAt,
    now,
  );
  // Marks are shown once graded. While waiting, MCQ results only appear if the policy already lets answers out.
  const showResult = (item: Item) =>
    graded || (data.reveal && item.kind === "mcq");
  let n = 0;
  return (
    <ol className="space-y-4">
      {data.items.map((item) => {
        n++;
        const r = item.result;
        const result = showResult(item) ? r : null;
        const awarded = result?.pointsAwarded ?? null;
        return (
          <li key={item.id}>
            <Card>
              <div className="px-5 pb-5 pt-4 max-sm:px-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
                  <span className="font-semibold text-eyebrow">
                    {item.kind === "file" ? "Upload" : `Question ${n}`}
                  </span>
                  <span>{KIND_LABEL[item.kind]}</span>
                  {result && awarded !== null ? (
                    <span className="tabular font-semibold text-ink">
                      {awarded} / {item.points}{" "}
                      {item.points === 1 ? "point" : "points"}
                    </span>
                  ) : (
                    <span>
                      {item.points} {item.points === 1 ? "point" : "points"}
                    </span>
                  )}
                  {item.kind === "mcq" && result && (
                    <>
                      {result.correct === null ? null : result.correct ? (
                        <Badge tone="good">
                          <Check aria-hidden className="size-3.5" /> Correct
                        </Badge>
                      ) : item.answer.chosenKey ? (
                        <Badge tone="risk">
                          <X aria-hidden className="size-3.5" /> Incorrect
                        </Badge>
                      ) : (
                        <Badge tone="warn">
                          <CircleHelp aria-hidden className="size-3.5" /> Not
                          answered
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <h3 className="mt-2 whitespace-pre-wrap text-lg font-medium leading-snug text-ink">
                  {item.prompt}
                </h3>

                {item.kind === "mcq" && item.options && (
                  <ul className="mt-4 grid gap-2" aria-label="Answer options">
                    {item.options.map((o) => {
                      const mine = item.answer.chosenKey === o.key;
                      const right = item.reveal?.correctKey === o.key;
                      return (
                        <li
                          key={o.key}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
                            right
                              ? "border-good/60 bg-good-soft"
                              : mine && item.reveal
                                ? "border-risk/60 bg-risk-soft"
                                : mine
                                  ? "border-brand bg-brand-soft"
                                  : "border-border bg-surface-2",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold",
                              mine
                                ? "border-brand bg-brand text-brand-ink"
                                : "border-border-strong text-ink-2",
                            )}
                          >
                            {o.key}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap pt-0.5 text-ink">
                            {o.text}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-xs font-semibold">
                            {mine && (
                              <span className="text-ink">Your answer</span>
                            )}
                            {right && (
                              <span className="inline-flex items-center gap-1 text-good">
                                <Check aria-hidden className="size-3.5" />{" "}
                                Correct answer
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {item.kind === "mcq" && !item.answer.chosenKey && (
                  <p className="mt-3 text-sm text-ink-2">
                    You didn&apos;t answer this question.
                  </p>
                )}
                {item.kind === "mcq" && item.reveal?.explanation && (
                  <div className="mt-3 rounded-xl bg-surface-2 p-3.5 text-sm">
                    <p className="font-semibold text-ink">Explanation</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink-2">
                      {item.reveal.explanation}
                    </p>
                  </div>
                )}
                {item.kind === "mcq" && graded && !item.reveal && note && (
                  <p className="mt-3 text-sm text-ink-2">{note}</p>
                )}

                {item.kind === "text" && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-ink-2">
                      Your answer
                    </p>
                    {item.answer.textAnswer ? (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-3.5 text-ink">
                        {item.answer.textAnswer}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-sm text-ink-2">
                        You didn&apos;t write an answer.
                      </p>
                    )}
                  </div>
                )}

                {item.kind === "file" && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-ink-2">
                      {item.files.length === 1 ? "Your file" : "Your files"}
                    </p>
                    {item.files.length ? (
                      <FileLinks
                        files={item.files}
                        label="Files you handed in"
                      />
                    ) : (
                      <p className="text-sm text-ink-2">
                        No files were uploaded.
                      </p>
                    )}
                  </div>
                )}

                {graded && r?.feedback && (
                  <div className="mt-4 rounded-xl border border-brand/40 bg-brand-soft p-3.5 text-sm">
                    <p className="font-semibold text-ink">Teacher feedback</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink">
                      {r.feedback}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
