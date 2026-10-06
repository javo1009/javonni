"use client";

import { useEffect, useRef, useState } from "react";
import { finishPractice, startPractice } from "@/app/actions/student";
import type { PracticeQuestion } from "@/services/practice";
import { PracticeSession, type SessionResult } from "./session";
import { PracticeSetup } from "./setup";
import { PracticeSummary } from "./summary";
import type { PracticeData, ScopeChoice, SessionConfig } from "./types";

type View =
  | { name: "setup" }
  | {
      name: "running";
      cfg: SessionConfig;
      questions: PracticeQuestion[];
      startedAt: number;
      run: number;
    }
  | {
      name: "summary";
      cfg: SessionConfig;
      result: SessionResult;
      durationMs: number;
    };

/** Holds a practice visit in the client: setup, then one question at a time, then the summary. No navigation between questions. */
export function PracticeApp({
  data,
  initial,
}: {
  data: PracticeData;
  initial: ScopeChoice | null;
}) {
  const [view, setView] = useState<View>({ name: "setup" });
  const [restartError, setRestartError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const answered = useRef(false);
  const finished = useRef(false);
  const runs = useRef(0);

  // Tell the server when the visit ends (summary shown, or leaving mid-session) so scores elsewhere refresh once.
  const finish = () => {
    if (answered.current && !finished.current) {
      finished.current = true;
      void finishPractice().catch(() => {});
    }
  };
  useEffect(() => () => finish(), []);

  function begin(cfg: SessionConfig, questions: PracticeQuestion[]) {
    finished.current = false;
    setRestartError(null);
    setView({
      name: "running",
      cfg,
      questions,
      startedAt: Date.now(),
      run: ++runs.current,
    });
  }

  async function again(cfg: SessionConfig) {
    setRestarting(true);
    setRestartError(null);
    try {
      const res = await startPractice(cfg.scope, cfg.count);
      if (res.ok && res.data.length) begin(cfg, res.data);
      else
        setRestartError(
          res.ok ? "There are no more questions for that." : res.error,
        );
    } catch {
      setRestartError("Couldn't reach the server. Try again.");
    }
    setRestarting(false);
  }

  if (view.name === "running") {
    const { cfg, questions, startedAt, run } = view;
    return (
      <PracticeSession
        key={run}
        questions={questions}
        timed={cfg.timed}
        label={cfg.label}
        startedAt={startedAt}
        onAnswered={() => {
          answered.current = true;
        }}
        onDone={(result) => {
          finish();
          setView({
            name: "summary",
            cfg,
            result,
            durationMs: Date.now() - startedAt,
          });
        }}
      />
    );
  }
  if (view.name === "summary") {
    const { cfg, result, durationMs } = view;
    return (
      <>
        <PracticeSummary
          result={result}
          label={cfg.label}
          durationMs={durationMs}
          onAgain={() => void again(cfg)}
          onNew={() => setView({ name: "setup" })}
        />
        <div className="mx-auto max-w-3xl" aria-live="polite">
          {restarting && (
            <p className="text-sm text-ink-2">Finding new questions…</p>
          )}
          {restartError && (
            <p
              role="alert"
              className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
            >
              {restartError}
            </p>
          )}
        </div>
      </>
    );
  }
  return <PracticeSetup data={data} initial={initial} onStart={begin} />;
}
