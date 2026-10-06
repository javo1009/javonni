export type ClassOption = { id: string; name: string; students: { id: string; name: string }[] };
export type ChapterOption = { id: string; number: number; title: string; count: number };
export type TopicOption = { id: string; name: string; modules: ChapterOption[] };

export const DIFFICULTY_LABEL: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
export const difficultyLabel = (d: number) => DIFFICULTY_LABEL[d] ?? "Medium";
