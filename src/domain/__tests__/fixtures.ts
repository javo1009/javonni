import type { LosInfo, ModuleInfo, TopicInfo } from "../types";

const TOPICS: [string, string, number, number, number, boolean][] = [
  ["ETH", "Ethical and Professional Standards", 15, 20, 2, true],
  ["QM", "Quantitative Methods", 6, 9, 3, false],
  ["ECO", "Economics", 6, 9, 2, false],
  ["FSA", "Financial Statement Analysis", 11, 14, 3, false],
  ["CF", "Corporate Finance", 6, 9, 2, false],
  ["EQ", "Equities", 11, 14, 2, false],
  ["FI", "Fixed Income", 11, 14, 3, false],
  ["DER", "Derivatives", 5, 8, 3, false],
  ["ALT", "Alternative Investments", 7, 10, 1, false],
  ["PM", "Portfolio Management", 8, 12, 2, false],
];

/** A small synthetic curriculum: 10 topics × 3 modules × 3 LOS. */
export function makeCurriculum() {
  const topics: TopicInfo[] = TOPICS.map(([code, name, min, max, difficulty, spread], i) => ({
    id: `t-${code}`,
    code,
    name,
    weightMin: min,
    weightMax: max,
    order: i,
    difficulty,
    spread,
  }));
  const modules: ModuleInfo[] = [];
  const los: LosInfo[] = [];
  for (const t of topics) {
    for (let m = 0; m < 3; m++) {
      const id = `m-${t.code}-${m}`;
      const losIds: string[] = [];
      for (let l = 0; l < 3; l++) {
        const lid = `l-${t.code}-${m}-${l}`;
        losIds.push(lid);
        los.push({
          id: lid,
          moduleId: id,
          code: `${t.code}.${m + 1}.${"abc"[l]}`,
          commandWord: "explain",
          text: `Objective ${t.code}.${m + 1}.${"abc"[l]}`,
          importance: 2,
          order: l,
        });
      }
      modules.push({ id, topicId: t.id, title: `${t.name} · Module ${m + 1}`, order: m, estMinutes: 180, losIds });
    }
  }
  return { topics, modules, los };
}
