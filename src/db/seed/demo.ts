// Demo class: one teacher, one admin, eight students with ~5 weeks of varied history.
// Everything goes through the real services with past timestamps, so the demo data
// obeys the same rules as real usage. Demo accounts share a published password:
// only seed this into throwaway/demo databases.

import { eq } from "drizzle-orm";
import { addDays, parseDate, type ISODate } from "@/domain/dates";
import { todayIn } from "@/lib/today";
import { createClass } from "@/services/classes";
import { getActiveCurriculum } from "@/services/curriculum";
import { assembleQuestions, createAssignment, getAssignmentForStudent, getAssignmentForTeacher, gradeSubmission, submitAssignment } from "@/services/homework";
import { createPlan, getActivePlan, setItemStatus } from "@/services/plan";
import { recordAttempt } from "@/services/practice";
import type { Actor } from "@/services/types";
import { createUser } from "@/services/users";
import type { Db } from "../client";
import { classes, enrollments, questionLos, questions, users } from "../schema";

export const DEMO_PASSWORD = "ascent-demo-2027";
export const DEMO_DOMAIN = "ascent.demo";

type Persona = {
  key: string;
  name: string;
  /** Probability of doing each due plan task. */
  adherence: number;
  /** Accuracy as a function of progress through the 5 weeks (0..1) and topic code. */
  accuracy: (t: number, topic: string) => number;
  /** Stop all activity this many days before today (inactive students). */
  stopDaysAgo?: number;
  /** Joined late: plan starts this many days ago instead of 35. */
  startDaysAgo?: number;
  /** Which homeworks (0-based) they skip. */
  skipsHomework?: number[];
  /** Which homeworks they hand in after the due date. */
  lateHomework?: number[];
};

const PERSONAS: Persona[] = [
  { key: "dana", name: "Dana Kim", adherence: 0.95, accuracy: () => 0.82 },
  { key: "omar", name: "Omar Haddad", adherence: 0.85, accuracy: () => 0.74, skipsHomework: [0, 1] },
  { key: "lina", name: "Lina Sato", adherence: 0.8, accuracy: () => 0.6 },
  { key: "marco", name: "Marco Rossi", adherence: 0.7, accuracy: () => 0.66, stopDaysAgo: 8, skipsHomework: [1] },
  { key: "priya", name: "Priya Nair", adherence: 0.9, accuracy: (t) => 0.45 + 0.45 * t, lateHomework: [0] },
  { key: "yusuf", name: "Yusuf Ali", adherence: 0.6, accuracy: () => 0.45 },
  { key: "elena", name: "Elena Petrova", adherence: 0.85, accuracy: (_t, topic) => (topic === "ETH" ? 0.4 : 0.86) },
  { key: "sam", name: "Sam Wright", adherence: 0.9, accuracy: () => 0.7, startDaysAgo: 5 },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (d: ISODate, hour: number, minute = 0) => parseDate(d) + (hour * 60 + minute) * 60_000;

export async function seedDemo(db: Db, opts: { today?: ISODate; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, `teacher@${DEMO_DOMAIN}`)).limit(1);
  if (existing.length) {
    log("Demo users already exist; skipped.");
    return { created: false as const };
  }
  const today = opts.today ?? todayIn("UTC");
  const rng = mulberry32(2027);
  const c = await getActiveCurriculum(db);
  const topicCode = new Map(c.topics.map((t) => [t.id, t.code]));
  const qRows = await db
    .select({ id: questions.id, stem: questions.stem, correctKey: questions.correctKey, options: questions.options, losId: questionLos.losId })
    .from(questions)
    .innerJoin(questionLos, eq(questionLos.questionId, questions.id))
    .where(eq(questions.status, "published"));
  const qByLos = new Map<string, typeof qRows>();
  for (const q of qRows) qByLos.set(q.losId, [...(qByLos.get(q.losId) ?? []), q]);
  const qByStem = new Map(qRows.map((q) => [q.stem, q]));

  const mk = (local: string, name: string, role: "student" | "teacher" | "admin") =>
    createUser(db, { email: `${local}@${DEMO_DOMAIN}`, name, role, password: DEMO_PASSWORD });

  await mk("admin", "Avery Admin", "admin");
  const t = await mk("teacher", "Jordan Mentor", "teacher");
  const teacher: Actor = { id: t.id, role: "teacher" };
  const cls = await createClass(db, teacher, { name: "Level I · Evening cohort", examDate: addDays(today, 105) });
  await db.update(classes).set({ joinCode: "DEMO27" }).where(eq(classes.id, cls.id));
  const examDate = addDays(today, 105);

  const answer = (q: (typeof qRows)[number], correct: boolean) =>
    correct ? q.correctKey : q.options.find((o) => o.key !== q.correctKey)!.key;

  const students: { actor: Actor; p: Persona }[] = [];
  for (const p of PERSONAS) {
    const u = await mk(p.key, p.name, "student");
    const actor: Actor = { id: u.id, role: "student" };
    const start = addDays(today, -(p.startDaysAgo ?? 35));
    await db.insert(enrollments).values({ classId: cls.id, studentId: u.id, joinedAt: new Date(at(start, 7)) });
    students.push({ actor, p });

    const stop = p.stopDaysAgo ? addDays(today, -p.stopDaysAgo) : today;
    await createPlan(
      db,
      actor,
      { today: start, examDate, weeklyMinutes: [75, 75, 60, 75, 45, 210, 180] },
      at(start, 8),
    );
    const plan = (await getActivePlan(db, u.id))!;
    const span = Math.max(1, parseDate(today) - parseDate(start));
    for (const item of plan.items) {
      if (item.date >= today || item.date > stop) continue;
      if (rng() > p.adherence) continue;
      await setItemStatus(db, actor, item.id, "done", { today: item.date });
      if (!["practice", "review", "quiz"].includes(item.type)) continue;
      const pool = item.losIds.flatMap((id) => qByLos.get(id) ?? []);
      if (pool.length === 0) continue;
      const n = item.type === "quiz" ? 6 : item.moduleId ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const q = pool[Math.floor(rng() * pool.length)];
        const progress = (parseDate(item.date) - parseDate(start)) / span;
        const code = topicCode.get(c.topicByLos.get(q.losId)!) ?? "";
        const correct = rng() < p.accuracy(progress, code);
        await recordAttempt(
          db,
          actor,
          { questionId: q.id, chosenKey: answer(q, correct), losId: q.losId, mode: item.type === "quiz" ? "timed" : "practice", timeMs: 40_000 + Math.floor(rng() * 80_000) },
          at(item.date, 19, k * 3),
        );
      }
    }
    log(`  ${p.name}: plan + history`);
  }

  // Homework: two past, one open.
  const losFor = (codes: string[]) => c.los.filter((l) => codes.some((code) => l.code.startsWith(code))).map((l) => l.id);
  const hwDefs = [
    { title: "Time value of money drill", scope: ["QM.1"], created: -27, due: -20, text: "In two or three sentences, explain why an annuity due is worth more than an ordinary annuity with the same payments." },
    { title: "Inventories and ratios", scope: ["FSA.1", "FSA.2"], created: -11, due: -4, text: null },
    { title: "Bond pricing basics", scope: ["FI.1"], created: -2, due: 3, text: null },
  ];
  const hwIds: string[] = [];
  for (const h of hwDefs) {
    const createdAt = new Date(at(addDays(today, h.created), 9));
    const { questionIds } = await assembleQuestions(db, teacher, { losIds: losFor(h.scope), count: 5 });
    const items = [
      ...questionIds.map((questionId) => ({ kind: "mcq" as const, questionId })),
      ...(h.text ? [{ kind: "text" as const, prompt: h.text, points: 2 }] : []),
    ];
    const a = await createAssignment(
      db,
      teacher,
      {
        classId: cls.id,
        title: h.title,
        instructions: "Work without notes first, then review the explanations.",
        dueAt: new Date(at(addDays(today, h.due), 21)),
        target: { kind: "class" },
        policies: { showAnswers: "after_due", allowLate: true },
        items,
        assign: true,
      },
      createdAt,
    );
    hwIds.push(a.id);
  }
  for (const { actor, p } of students) {
    for (const [i, id] of hwIds.entries()) {
      const h = hwDefs[i];
      if (p.skipsHomework?.includes(i)) continue;
      if (p.startDaysAgo && -h.created > p.startDaysAgo) continue; // joined after it was set
      if (h.due > 0 && rng() < 0.5) continue; // open homework: only some have done it
      const lateDay = p.lateHomework?.includes(i);
      const planned = addDays(today, lateDay ? h.due + 1 : h.due - 1 - Math.floor(rng() * 2));
      const submitDay = planned > today ? today : planned; // never in the future
      if (p.stopDaysAgo && submitDay > addDays(today, -p.stopDaysAgo)) continue;
      const view = await getAssignmentForStudent(db, actor, id, new Date(at(submitDay, 12)));
      const answers = view.items.map((it) => {
        if (it.kind === "text") return { itemId: it.id, textAnswer: "Each payment arrives one period earlier, so every cash flow is discounted one period less." };
        const q = qByStem.get(it.prompt ?? "");
        const ok = rng() < p.accuracy(0.5, "");
        return { itemId: it.id, chosenKey: q ? answer(q, ok) : "A" };
      });
      await submitAssignment(db, actor, id, answers, new Date(Math.min(at(submitDay, 20), Date.now())));
    }
  }
  // Teacher grades the written answers on the first homework.
  const detail = await getAssignmentForTeacher(db, teacher, hwIds[0]);
  const textItem = detail.items.find((i) => i.item.kind === "text")?.item;
  for (const s of detail.students.filter((x) => x.status === "submitted").slice(0, 5)) {
    if (!textItem || !s.submissionId) continue;
    await gradeSubmission(db, teacher, s.submissionId, {
      items: [{ itemId: textItem.id, points: 2, feedback: "Clear and correct." }],
      feedback: "Good work. Review the annuity-due formula once more.",
    });
  }
  log("  homework: 3 assignments, submissions and grading");
  return { created: true as const, classId: cls.id, joinCode: "DEMO27" };
}
