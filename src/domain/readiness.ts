// Readiness index: exam-weight-averaged mastery with an honest range.
// Unseen LOS count as 0, so the number is conservative and rises with coverage.
// It is NOT a pass probability (PLAN.md §4.3).

import { MASTERY_CONFIG, masteryOf, varianceOf, evidenceOf, type MasteryState } from "./mastery";
import type { LosInfo, ModuleInfo, TopicInfo } from "./types";

export type TopicReadiness = {
  topicId: string;
  /** 0..1 */
  mastery: number;
  /** Fraction of LOS in the topic with any attempt. */
  attemptedShare: number;
  evidence: number;
  losCount: number;
  belowFloor: boolean;
};

export type EvidenceLabel = "low" | "moderate" | "high";

export type Readiness = {
  /** Percent points, 0..100. */
  mid: number;
  low: number;
  high: number;
  evidenceLabel: EvidenceLabel;
  /** True when too little has been attempted to show a number. */
  insufficient: boolean;
  topics: TopicReadiness[];
};

const Z80 = 1.2816;

export function computeReadiness(
  topics: TopicInfo[],
  modules: ModuleInfo[],
  los: LosInfo[],
  states: Map<string, MasteryState>,
  nowMs: number,
): Readiness {
  const moduleTopic = new Map(modules.map((m) => [m.id, m.topicId]));
  const losByTopic = new Map<string, LosInfo[]>();
  for (const l of los) {
    const tid = moduleTopic.get(l.moduleId);
    if (!tid) continue;
    const arr = losByTopic.get(tid) ?? [];
    arr.push(l);
    losByTopic.set(tid, arr);
  }

  const out: TopicReadiness[] = [];
  let wSum = 0;
  let mSum = 0;
  let vSum = 0;
  let evidenceTotal = 0;
  let losTotal = 0;
  let attemptedTotal = 0;

  for (const t of topics) {
    const ls = losByTopic.get(t.id) ?? [];
    if (ls.length === 0) continue;
    const impSum = ls.reduce((s, l) => s + l.importance, 0);
    let m = 0;
    let v = 0;
    let ev = 0;
    let attempted = 0;
    for (const l of ls) {
      const st = states.get(l.id);
      if (st && st.attempts > 0) {
        m += l.importance * masteryOf(st, nowMs);
        v += l.importance ** 2 * varianceOf(st, nowMs);
        ev += evidenceOf(st, nowMs);
        attempted++;
      }
    }
    m /= impSum;
    v /= impSum ** 2;
    const w = (t.weightMin + t.weightMax) / 2;
    wSum += w;
    mSum += w * m;
    vSum += w ** 2 * v;
    evidenceTotal += ev;
    losTotal += ls.length;
    attemptedTotal += attempted;
    out.push({
      topicId: t.id,
      mastery: m,
      attemptedShare: attempted / ls.length,
      evidence: ev,
      losCount: ls.length,
      belowFloor: attempted > 0 && m < MASTERY_CONFIG.topicFloor,
    });
  }

  const mean = wSum > 0 ? mSum / wSum : 0;
  const sigma = wSum > 0 ? Math.sqrt(vSum) / wSum : 0;
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  const avgEvidence = losTotal ? evidenceTotal / losTotal : 0;
  const evidenceLabel: EvidenceLabel = avgEvidence < 0.5 ? "low" : avgEvidence < 2 ? "moderate" : "high";
  return {
    mid: Math.round(clamp(mean * 100)),
    low: Math.round(clamp((mean - Z80 * sigma) * 100)),
    high: Math.round(clamp((mean + Z80 * sigma) * 100)),
    evidenceLabel,
    insufficient: losTotal === 0 || attemptedTotal / losTotal < 0.05,
    topics: out,
  };
}
