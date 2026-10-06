// Study-plan generator. Pure and deterministic: same input -> same plan.
// See docs/cfa-platform/PLAN.md §4.2 for the design.

import { addDays, diffDays, eachDay, weekdayIndex, type ISODate } from "./dates";
import type {
  GeneratedPlan,
  ModuleInfo,
  PlanItemDraft,
  PlanItemType,
  PlanPhase,
  PlanWarning,
  TopicInfo,
} from "./types";

export type PlanOptions = {
  /** Fraction of each day's stated availability held back as slack. */
  bufferPct: number;
  /** Share of total capacity for each phase. Must sum to 1. */
  phaseSplit: { learn: number; practice: number; mock: number };
  maxChunkMinutes: number;
  minChunkMinutes: number;
  /** 'auto' picks 0–3 mocks from the runway length. */
  mockCount: number | "auto";
  /** One mock = two sessions of this length (on separate days). */
  mockSessionMinutes: number;
  /** Final days before the exam capped to light review. */
  taperDays: number;
  /** Commonly cited study-hours benchmark per level. Warning only. */
  benchmarkMinutes: number;
  /** Share of a module's learn time spent reading (rest is practice). */
  readShare: number;
  /** Do not schedule a mock session closer than this to the exam. */
  lastMockDaysBeforeExam: number;
};

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  bufferPct: 0.1,
  phaseSplit: { learn: 0.58, practice: 0.25, mock: 0.17 },
  maxChunkMinutes: 90,
  minChunkMinutes: 20,
  mockCount: "auto",
  mockSessionMinutes: 135,
  taperDays: 2,
  benchmarkMinutes: 300 * 60,
  readShare: 0.65,
  lastMockDaysBeforeExam: 5,
};

export type PlanInput = {
  /** First day the plan may use. */
  startDate: ISODate;
  examDate: ISODate;
  /** Study minutes per weekday, Monday first (length 7). */
  weeklyMinutes: number[];
  blackoutDates?: ISODate[];
  topics: TopicInfo[];
  modules: ModuleInfo[];
  /** Prior mastery per topic id, 0..1 (e.g. from a diagnostic). */
  priorMastery?: Record<string, number>;
  /** Modules whose reading is already done (used when re-planning). */
  completedModuleIds?: string[];
  options?: Partial<PlanOptions>;
};

const round5 = (n: number) => Math.round(n / 5) * 5;
const floor5 = (n: number) => Math.floor(n / 5) * 5;
const weightMid = (t: TopicInfo) => (t.weightMin + t.weightMax) / 2;

/** Sequential fill of tasks into days with per-day capacity. */
class Packer {
  private cursor = 0;
  constructor(
    private days: ISODate[],
    private cap: Map<ISODate, number>,
    private minChunk: number,
    private maxChunk: number,
  ) {}

  remaining(): number {
    let s = 0;
    for (let i = this.cursor; i < this.days.length; i++) s += this.cap.get(this.days[i]) ?? 0;
    return s;
  }

  /**
   * Place a short block on one day, shrinking it (down to `minMinutes`) to fit the
   * first day with enough room. Used for practice/review blocks that shouldn't be split.
   */
  placeFlexible(
    standard: number,
    minMinutes: number,
    make: (date: ISODate, minutes: number, part?: number, parts?: number) => PlanItemDraft,
  ): PlanItemDraft[] | null {
    for (let idx = this.cursor; idx < this.days.length; idx++) {
      const avail = this.cap.get(this.days[idx]) ?? 0;
      if (avail < minMinutes) continue;
      const take = Math.min(avail, standard);
      this.cap.set(this.days[idx], avail - take);
      this.cursor = idx;
      return [make(this.days[idx], take)];
    }
    return null;
  }

  /** Place a task (possibly split over days). Atomic: returns null if it doesn't fit. */
  place(
    minutes: number,
    make: (date: ISODate, minutes: number, part?: number, parts?: number) => PlanItemDraft,
  ): PlanItemDraft[] | null {
    let left = minutes;
    const chunks: { idx: number; minutes: number }[] = [];
    for (let idx = this.cursor; idx < this.days.length && left > 0; idx++) {
      const avail = this.cap.get(this.days[idx]) ?? 0;
      let take = Math.min(avail, left, this.maxChunk);
      // Never leave a tiny trailing part: leave at least minChunk for the next day.
      if (take < left && left - take < this.minChunk) take = left - this.minChunk;
      if (take >= this.minChunk || (take > 0 && take === left)) {
        chunks.push({ idx, minutes: take });
        left -= take;
      }
    }
    if (left > 0 || chunks.length === 0) return null;
    const out = chunks.map((c, i) =>
      make(
        this.days[c.idx],
        c.minutes,
        chunks.length > 1 ? i + 1 : undefined,
        chunks.length > 1 ? chunks.length : undefined,
      ),
    );
    for (const c of chunks) {
      const d = this.days[c.idx];
      this.cap.set(d, (this.cap.get(d) ?? 0) - c.minutes);
    }
    this.cursor = chunks[chunks.length - 1].idx;
    return out;
  }
}

/** Smooth weighted round-robin: spreads heavy items evenly through the sequence. */
function weightedSequence(weights: number[], n: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || weights.length === 0) return [];
  const cur = weights.map(() => 0);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < weights.length; i++) cur[i] += weights[i] / total;
    let best = 0;
    for (let i = 1; i < weights.length; i++) if (cur[i] > cur[best] + 1e-12) best = i;
    cur[best] -= 1;
    out.push(best);
  }
  return out;
}

/** Spread `spread` modules evenly among `rest`, preserving each list's order. */
function interleaveSpread<T>(rest: T[], spread: T[]): T[] {
  if (spread.length === 0) return rest;
  const n = rest.length + spread.length;
  const slots = new Set<number>();
  spread.forEach((_, j) => slots.add(Math.min(n - 1, Math.floor(((j + 0.5) * n) / spread.length))));
  const out: T[] = [];
  let r = 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (slots.has(i) && s < spread.length) out.push(spread[s++]);
    else if (r < rest.length) out.push(rest[r++]);
    else out.push(spread[s++]);
  }
  return out;
}

function autoMockCount(days: number): number {
  const weeks = days / 7;
  if (weeks >= 10) return 3;
  if (weeks >= 6) return 2;
  if (weeks >= 4) return 1;
  return 0;
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const opt: PlanOptions = { ...DEFAULT_PLAN_OPTIONS, ...input.options };
  const warnings: PlanWarning[] = [];
  const empty = (): GeneratedPlan => ({
    items: [],
    phases: [],
    summary: {
      startDate: input.startDate,
      examDate: input.examDate,
      days: 0,
      capacityMinutes: 0,
      budgetMinutes: 0,
      plannedMinutes: 0,
    },
    warnings,
  });

  const lastDay = addDays(input.examDate, -1);
  if (input.startDate > lastDay) {
    warnings.push({ code: "EXAM_TOO_SOON", message: "The exam date leaves no days to study." });
    return empty();
  }
  if (input.weeklyMinutes.length !== 7) throw new Error("weeklyMinutes must have 7 entries (Mon..Sun)");

  const blackout = new Set(input.blackoutDates ?? []);
  const days = eachDay(input.startDate, lastDay);
  const cap = new Map<ISODate, number>();
  let rawCapacity = 0;
  for (const d of days) {
    const raw = blackout.has(d) ? 0 : Math.max(0, input.weeklyMinutes[weekdayIndex(d)] ?? 0);
    rawCapacity += raw;
    cap.set(d, floor5(raw * (1 - opt.bufferPct)));
  }
  const budget = [...cap.values()].reduce((a, b) => a + b, 0);
  if (budget === 0) {
    warnings.push({ code: "NO_CAPACITY", message: "No study time is available before the exam." });
    return empty();
  }

  if (days.length < 28)
    warnings.push({
      code: "SHORT_RUNWAY",
      message: `Only ${days.length} days until the exam. The plan is compressed; focus on high-weight topics.`,
    });
  const completed = new Set(input.completedModuleIds ?? []);
  const remainingBenchmark = opt.benchmarkMinutes;
  if (completed.size === 0 && budget < 0.8 * remainingBenchmark)
    warnings.push({
      code: "BUDGET_LOW",
      message: `This plan holds about ${Math.round(budget / 60)} h of study; ~${Math.round(
        remainingBenchmark / 60,
      )} h is a commonly cited benchmark for Level I. Consider adding time.`,
    });

  // ---- Phase boundaries (by cumulative capacity, cut on day boundaries) ----
  const mockWanted = opt.mockCount === "auto" ? autoMockCount(days.length) : opt.mockCount;
  let split = { ...opt.phaseSplit };
  if (mockWanted === 0) {
    split = { learn: split.learn + split.mock * 0.5, practice: split.practice + split.mock * 0.5, mock: 0 };
  }
  const cum: number[] = [];
  days.reduce((acc, d, i) => (cum[i] = acc + (cap.get(d) ?? 0)), 0);
  const cutAt = (fraction: number): number => {
    const target = fraction * budget;
    const i = cum.findIndex((c) => c >= target);
    return i < 0 ? days.length - 1 : i;
  };
  let learnEnd = cutAt(split.learn); // last learn day index
  let mockStart = mockWanted === 0 ? days.length : Math.min(days.length - 1, cutAt(split.learn + split.practice) + 1);
  if (mockWanted > 0) {
    const minMockDays = Math.min(14, days.length - 1);
    mockStart = Math.min(mockStart, days.length - minMockDays);
  }
  if (mockWanted > 0) {
    // Mocks need two long study days each; grow the mock phase (at the practice
    // phase's expense, keeping a week of practice) until enough long days exist.
    const lastAllowedMock = addDays(input.examDate, -opt.lastMockDaysBeforeExam);
    const longCount = (from: number) =>
      days.slice(from).filter((d) => d <= lastAllowedMock && (cap.get(d) ?? 0) >= opt.mockSessionMinutes).length;
    const minPracticeEnd = Math.min(days.length - 1, learnEnd + 7);
    while (mockStart > minPracticeEnd && longCount(mockStart) < 2 * mockWanted) mockStart--;
  }
  learnEnd = Math.max(0, Math.min(learnEnd, mockStart - 1));
  const learnDays = days.slice(0, learnEnd + 1);
  const practiceDays = days.slice(learnEnd + 1, mockStart);
  const mockDays = days.slice(mockStart);

  const items: PlanItemDraft[] = [];
  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  const prior = input.priorMastery ?? {};
  const topicFactor = (t: TopicInfo) =>
    Math.max(0.05, weightMid(t) * t.difficulty * (1 - 0.5 * Math.min(1, Math.max(0, prior[t.id] ?? 0))));

  // ---- Learn phase ----
  const orderedTopics = [...input.topics].sort((a, b) => a.order - b.order);
  const modulesByTopic = new Map<string, ModuleInfo[]>();
  for (const m of [...input.modules].sort((a, b) => a.order - b.order)) {
    if (completed.has(m.id)) continue;
    const arr = modulesByTopic.get(m.topicId) ?? [];
    arr.push(m);
    modulesByTopic.set(m.topicId, arr);
  }
  const learnCapacity = learnDays.reduce((s, d) => s + (cap.get(d) ?? 0), 0);
  const activeTopics = orderedTopics.filter((t) => (modulesByTopic.get(t.id) ?? []).length > 0);
  const factorSum = activeTopics.reduce((s, t) => s + topicFactor(t), 0);
  const demand = new Map<string, number>(); // module id -> minutes
  for (const t of activeTopics) {
    const mods = modulesByTopic.get(t.id)!;
    const est = mods.reduce((s, m) => s + Math.max(1, m.estMinutes), 0);
    for (const m of mods) {
      demand.set(m.id, ((learnCapacity * 0.97 * topicFactor(t)) / factorSum) * (Math.max(1, m.estMinutes) / est));
    }
  }
  // Keep every module above a floor where the budget allows, then renormalise.
  const floorMin = 30;
  let total = 0;
  for (const [id, v] of demand) {
    const f = Math.max(v, floorMin);
    demand.set(id, f);
    total += f;
  }
  const scale = total > 0 ? Math.min(1, (learnCapacity * 0.97) / total) : 1;
  if (scale < 0.999 && total > 0)
    warnings.push({
      code: "LEARN_COMPRESSED",
      message: "Learning time per module is below the planned minimum. Add study time or move the exam date.",
    });

  const flatModules: ModuleInfo[] = [];
  const spreadMods: ModuleInfo[] = [];
  const restMods: ModuleInfo[] = [];
  for (const t of activeTopics) (t.spread ? spreadMods : restMods).push(...modulesByTopic.get(t.id)!);
  flatModules.push(...interleaveSpread(restMods, spreadMods));

  const learnPacker = new Packer(learnDays, cap, opt.minChunkMinutes, opt.maxChunkMinutes);
  const practicePackerForSpill = new Packer(practiceDays, cap, opt.minChunkMinutes, opt.maxChunkMinutes);
  let spilled = 0;
  const mk =
    (type: PlanItemType, phase: PlanPhase, title: string, topicId: string | null, moduleId: string | null, losIds: string[]) =>
    (date: ISODate, minutes: number, part?: number, parts?: number): PlanItemDraft => ({
      date,
      type,
      phase,
      title: parts ? `${title} (${part}/${parts})` : title,
      minutes,
      topicId,
      moduleId,
      losIds,
      part,
      parts,
    });

  for (const m of flatModules) {
    const mins = round5((demand.get(m.id) ?? floorMin) * scale);
    if (mins < 10) continue;
    const readMin = Math.max(10, round5(mins * opt.readShare));
    const pracMin = Math.max(0, mins - readMin);
    const topic = topicById.get(m.topicId)!;
    const readTask = mk("read", "learn", `Read · ${m.title}`, topic.id, m.id, m.losIds);
    const readItems = learnPacker.place(readMin, readTask) ?? practicePackerForSpill.place(readMin, readTask);
    if (!readItems) {
      spilled++;
      continue;
    }
    items.push(...readItems);
    if (pracMin >= 10) {
      const pracTask = mk("practice", "learn", `Practice · ${m.title}`, topic.id, m.id, m.losIds);
      const pi = learnPacker.place(pracMin, pracTask) ?? practicePackerForSpill.place(pracMin, pracTask);
      if (pi) items.push(...pi);
    }
  }
  if (spilled > 0)
    warnings.push({
      code: "LEARN_SPILL",
      message: `${spilled} module(s) did not fit before the exam. Add study time or move the exam date.`,
    });

  // ---- Practice & review sequences (fill remaining capacity) ----
  const sequenceTopics = activeTopics.length ? activeTopics : orderedTopics;
  const allLosByTopic = new Map<string, string[]>();
  for (const m of input.modules) {
    const arr = allLosByTopic.get(m.topicId) ?? [];
    arr.push(...m.losIds);
    allLosByTopic.set(m.topicId, arr);
  }
  const allLos = input.modules.flatMap((m) => m.losIds);

  const fill = (packer: Packer, phase: PlanPhase, tag: "practice" | "mock") => {
    const weights = sequenceTopics.map(topicFactor);
    const seq = weightedSequence(weights, 400);
    let topicBlocks = 0;
    let step = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const pos = step % 6;
      let placed: PlanItemDraft[] | null = null;
      if (pos === 2) {
        placed = packer.placeFlexible(30, 20, mk("review", phase, "Mixed review · spaced", null, null, allLos));
      } else if (pos === 5) {
        placed = packer.placeFlexible(
          45,
          30,
          mk("quiz", phase, tag === "mock" ? "Cumulative test" : "Weekly quiz", null, null, allLos),
        );
      } else {
        const topic = sequenceTopics[seq[topicBlocks % seq.length]];
        placed = packer.placeFlexible(
          40,
          20,
          mk("practice", phase, `Practice · ${topic.name}`, topic.id, null, allLosByTopic.get(topic.id) ?? []),
        );
        if (placed) topicBlocks++;
      }
      if (!placed) {
        break;
      }
      items.push(...placed);
      step++;
    }
  };
  if (practiceDays.length) fill(new Packer(practiceDays, cap, opt.minChunkMinutes, opt.maxChunkMinutes), "practice", "practice");

  // ---- Mock phase ----
  if (mockDays.length) {
    const sessions = opt.mockSessionMinutes;
    const lastAllowed = addDays(input.examDate, -opt.lastMockDaysBeforeExam);
    const longDays = mockDays.filter((d) => d <= lastAllowed && (cap.get(d) ?? 0) >= sessions);
    const wanted = mockWanted;
    // How many whole mocks (2 sessions each) fit on distinct long days?
    const fitting = Math.min(wanted, Math.floor(longDays.length / 2));
    if (fitting < wanted)
      warnings.push({
        code: "MOCKS_REDUCED",
        message: `Only ${fitting} of ${wanted} full mock exams fit. Mocks need two study days of ${sessions} min each. Add a long weekend slot.`,
      });
    // Candidate session pairs: adjacent calendar days first (e.g. Sat+Sun), then any two.
    const pairs: [ISODate, ISODate][] = [];
    const taken = new Set<ISODate>();
    for (let i = 0; i + 1 < longDays.length; i++) {
      if (diffDays(longDays[i], longDays[i + 1]) === 1 && !taken.has(longDays[i]) && !taken.has(longDays[i + 1])) {
        pairs.push([longDays[i], longDays[i + 1]]);
        taken.add(longDays[i]);
        taken.add(longDays[i + 1]);
      }
    }
    const leftover = longDays.filter((d) => !taken.has(d));
    for (let i = 0; i + 1 < leftover.length; i += 2) pairs.push([leftover[i], leftover[i + 1]]);
    pairs.sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const chosen: [ISODate, ISODate][] = [];
    for (let k = 0; k < fitting; k++) chosen.push(pairs[Math.min(pairs.length - 1, Math.floor(((k + 0.5) * pairs.length) / fitting))]);
    for (let k = 0; k < chosen.length; k++) {
      const sessionDays = chosen[k];
      sessionDays.forEach((d, s) => {
        cap.set(d, (cap.get(d) ?? 0) - sessions);
        items.push({
          date: d,
          type: "mock",
          phase: "mock",
          title: `Mock exam ${k + 1} · Session ${s === 0 ? "A" : "B"}`,
          minutes: sessions,
          topicId: null,
          moduleId: null,
          losIds: allLos,
        });
      });
      // Review the mock on the next day with room.
      const after = mockDays.find((d) => d > sessionDays[1] && (cap.get(d) ?? 0) >= 45);
      if (after) {
        const m = Math.min(90, floor5(cap.get(after) ?? 0));
        cap.set(after, (cap.get(after) ?? 0) - m);
        items.push({
          date: after,
          type: "mock_review",
          phase: "mock",
          title: `Review mock ${k + 1} · mistakes & weak topics`,
          minutes: m,
          topicId: null,
          moduleId: null,
          losIds: allLos,
        });
      }
    }
    // Taper: last days are light.
    const taper = mockDays.slice(-opt.taperDays);
    for (const d of taper) cap.set(d, Math.min(cap.get(d) ?? 0, 60));
    const taperSet = new Set(taper);
    const mid = mockDays.filter((d) => !taperSet.has(d));
    if (mid.length) fill(new Packer(mid, cap, opt.minChunkMinutes, opt.maxChunkMinutes), "mock", "mock");
    for (const d of taper) {
      const c = floor5(cap.get(d) ?? 0);
      if (c >= 20) {
        cap.set(d, (cap.get(d) ?? 0) - c);
        items.push({
          date: d,
          type: "final_review",
          phase: "mock",
          title: "Final review · formulas & error log",
          minutes: c,
          topicId: null,
          moduleId: null,
          losIds: allLos,
        });
      }
    }
  }

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const planned = items.reduce((s, i) => s + i.minutes, 0);
  const phases = (
    [
      ["learn", learnDays],
      ["practice", practiceDays],
      ["mock", mockDays],
    ] as const
  )
    .filter(([, ds]) => ds.length > 0)
    .map(([phase, ds]) => ({
      phase,
      startDate: ds[0],
      endDate: ds[ds.length - 1],
      minutes: items.filter((i) => i.date >= ds[0] && i.date <= ds[ds.length - 1]).reduce((s, i) => s + i.minutes, 0),
    }));

  return {
    items,
    phases,
    summary: {
      startDate: input.startDate,
      examDate: input.examDate,
      days: diffDays(input.startDate, input.examDate),
      capacityMinutes: rawCapacity,
      budgetMinutes: budget,
      plannedMinutes: planned,
    },
    warnings,
  };
}
