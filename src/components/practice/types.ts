// Shapes the practice page hands to its client components (plain data only).

export type ChapterOption = {
  id: string;
  number: number;
  title: string;
  /** Published questions in the bank for this chapter. */
  questions: number;
  /** The student's recorded practice score (percent), if any. */
  score: number | null;
  /** The student's platform answers in this chapter. */
  attempts: number;
  correct: number;
};

export type TopicOption = {
  id: string;
  name: string;
  weightLabel: string;
  questions: number;
  chapters: ChapterOption[];
};

export type PracticeData = {
  topics: TopicOption[];
  /** Chapters with a recorded score below the weak threshold and at least one question. Weakest first. */
  weak: ChapterOption[];
  weakThreshold: number;
  totalQuestions: number;
};

export type ScopeChoice =
  | { kind: "module"; id: string }
  | { kind: "topic"; id: string }
  | { kind: "weak" }
  | { kind: "mixed" };

export type SessionConfig = {
  scope: ScopeChoice;
  /** What to call this session ("Chapter 3 · Title", "Weak chapters"…). */
  label: string;
  count: number;
  timed: boolean;
};
