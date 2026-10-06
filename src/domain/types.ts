import type { ISODate } from "./dates";

export type CommandWord = string;

export type TopicInfo = {
  id: string;
  code: string;
  name: string;
  /** Exam weight range, percent. */
  weightMin: number;
  weightMax: number;
  order: number;
  /** 1 (light) … 3 (heavy) author estimate of study effort per hour of content. */
  difficulty: number;
  /** Spread this topic's modules evenly across the learn phase (e.g. Ethics). */
  spread: boolean;
};

export type ModuleInfo = {
  id: string;
  topicId: string;
  title: string;
  order: number;
  estMinutes: number;
  losIds: string[];
};

export type LosInfo = {
  id: string;
  moduleId: string;
  code: string;
  commandWord: CommandWord;
  text: string;
  importance: 1 | 2 | 3;
  order: number;
};

export type PlanItemType =
  | "read"
  | "practice"
  | "review"
  | "quiz"
  | "mock"
  | "mock_review"
  | "final_review";

export type PlanPhase = "learn" | "practice" | "mock";

export type PlanItemDraft = {
  date: ISODate;
  type: PlanItemType;
  phase: PlanPhase;
  title: string;
  minutes: number;
  topicId: string | null;
  moduleId: string | null;
  losIds: string[];
  /** Position within a task that had to be split across days, 1-based. */
  part?: number;
  parts?: number;
};

export type PlanWarning = { code: string; message: string };

export type GeneratedPlan = {
  items: PlanItemDraft[];
  phases: { phase: PlanPhase; startDate: ISODate; endDate: ISODate; minutes: number }[];
  summary: {
    startDate: ISODate;
    examDate: ISODate;
    days: number;
    capacityMinutes: number;
    budgetMinutes: number;
    plannedMinutes: number;
  };
  warnings: PlanWarning[];
};
