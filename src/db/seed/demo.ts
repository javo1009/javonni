// Demo class: one admin, one teacher, eight students with five weeks of varied study history.
// Everything goes through the real services with dated activity, so the demo data obeys the
// same rules as real use. Demo accounts share a published password: only seed throwaway databases.

import { eq } from "drizzle-orm";
import { addDays, diffDays, type ISODate } from "@/domain/dates";
import { todayIn } from "@/lib/today";
import { createClass } from "@/services/classes";
import { getActiveCurriculum } from "@/services/curriculum";
import { assembleQuestions, createAssignment, getAssignmentForStudent, getAssignmentForTeacher, gradeSubmission, submitAssignment } from "@/services/homework";
import { addMock, ensureProfile, logSession, updateChapter } from "@/services/tracker";
import type { Actor } from "@/services/types";
import { createUser } from "@/services/users";
import type { Db } from "../client";
import { classes, enrollments, questions, users } from "../schema";

export const DEMO_PASSWORD = "ascent-demo-2027";
export const DEMO_DOMAIN = "ascent.demo";
export const DEMO_JOIN_CODE = "DEMO27";

type Persona = {
  key: string;
  name: string;
  /** Chance of studying on any given day. */
  studyProb: number;
  /** Chapters read per week of studying. */
  chaptersPerWeek: number;
  minutesPerSession: [number, number];
  /** Practice score as a function of progress through the period (0..1) and topic name. */
  accuracy: (t: number, topic: string) => number;
  reviewProb: number;
  /** Rates themselves "solid" regardless of how they score. */
  overconfident?: boolean;
  /** Stop all activity this many days before today. */
  stoppedDaysAgo?: number;
  /** Joined this many days ago instead of at the start. */
  joinedDaysAgo?: number;
  skipsHomework?: number[];
  lateHomework?: number[];
  /** Mock scores at days-ago offsets. */
  mocks: [number, number][];
};

const PERSONAS: Persona[] = [
  { key: "dana", name: "Dana Kim", studyProb: 0.92, chaptersPerWeek: 7, minutesPerSession: [90, 180], accuracy: () => 82, reviewProb: 0.85, mocks: [[20, 61], [6, 68]] },
  { key: "omar", name: "Omar Haddad", studyProb: 0.8, chaptersPerWeek: 6, minutesPerSession: [75, 150], accuracy: () => 74, reviewProb: 0.6, skipsHomework: [0, 1], mocks: [[9, 64]] },
  { key: "lina", name: "Lina Sato", studyProb: 0.8, chaptersPerWeek: 4.5, minutesPerSession: [60, 120], accuracy: () => 58, reviewProb: 0.5, overconfident: true, mocks: [[12, 55]] },
  { key: "marco", name: "Marco Rossi", studyProb: 0.7, chaptersPerWeek: 5, minutesPerSession: [60, 120], accuracy: () => 66, reviewProb: 0.4, stoppedDaysAgo: 9, skipsHomework: [1], mocks: [[18, 60], [12, 52]] },
  { key: "priya", name: "Priya Nair", studyProb: 0.9, chaptersPerWeek: 6.5, minutesPerSession: [75, 150], accuracy: (t) => 45 + 43 * t, reviewProb: 0.8, lateHomework: [0], mocks: [[26, 52], [14, 61], [3, 70]] },
  { key: "yusuf", name: "Yusuf Ali", studyProb: 0.55, chaptersPerWeek: 3.5, minutesPerSession: [45, 90], accuracy: () => 48, reviewProb: 0.3, mocks: [] },
  { key: "elena", name: "Elena Petrova", studyProb: 0.85, chaptersPerWeek: 6, minutesPerSession: [75, 150], accuracy: (_t, topic) => (topic === "Ethical and Professional Standards" ? 45 : topic.startsWith("Financial") || topic.startsWith("Quant") ? 91 : 80), reviewProb: 0.7, mocks: [[8, 66]] },
  { key: "sam", name: "Sam Wright", studyProb: 0.9, chaptersPerWeek: 5, minutesPerSession: [45, 90], accuracy: () => 70, reviewProb: 0.5, joinedDaysAgo: 5, mocks: [] },
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

const at = (d: ISODate, hour: number) => new Date(`${d}T${String(hour).padStart(2, "0")}:00:00Z`);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function seedDemo(db: Db, opts: { today?: ISODate; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, `teacher@${DEMO_DOMAIN}`)).limit(1);
  if (existing.length) {
    log("Demo users already exist; skipped.");
    return { created: false as const };
  }
  const today = opts.today ?? todayIn("UTC");
  const rng = mulberry32(2027);
  const cur = await getActiveCurriculum(db);
  const mk = (local: string, name: string, role: "student" | "teacher" | "admin") =>
    createUser(db, { email: `${local}@${DEMO_DOMAIN}`, name, role, password: DEMO_PASSWORD });

  await mk("admin", "Avery Admin", "admin");
  const t = await mk("teacher", "Jordan Mentor", "teacher");
  const teacher: Actor = { id: t.id, role: "teacher" };

  const planStart = addDays(today, -35);
  let examDate: ISODate = "2027-02-18";
  if (diffDays(today, examDate) < 60) examDate = addDays(today, 120);
  const cls = await createClass(db, teacher, { name: "Level I · Evening cohort", examDate, planStart, weeklyTargetHours: 10 }, addDays(planStart, -1));
  await db.update(classes).set({ joinCode: DEMO_JOIN_CODE }).where(eq(classes.id, cls.id));

  const topicName = new Map(cur.topics.map((x) => [x.id, x.name]));
  const students: { actor: Actor; p: Persona }[] = [];

  for (const p of PERSONAS) {
    const u = await mk(p.key, p.name, "student");
    const actor: Actor = { id: u.id, role: "student" };
    students.push({ actor, p });
    const joinDay = addDays(today, -(p.joinedDaysAgo ?? 35));
    await db.insert(enrollments).values({ classId: cls.id, studentId: u.id, joinedAt: at(joinDay, 7) });
    await ensureProfile(db, u.id, joinDay);

    const lastDay = addDays(today, p.stoppedDaysAgo ? -p.stoppedDaysAgo : 0);
    let carry = 0;
    let next = 0; // next unread chapter in curriculum order
    const perStudyDay = p.chaptersPerWeek / (7 * p.studyProb);
    for (let d = joinDay; d <= lastDay; d = addDays(d, 1)) {
      if (rng() > p.studyProb) continue;
      const progress = diffDays(joinDay, d) / Math.max(1, diffDays(joinDay, today));
      const minutes = Math.round((p.minutesPerSession[0] + rng() * (p.minutesPerSession[1] - p.minutesPerSession[0])) / 15) * 15;
      carry += perStudyDay;
      let reads = Math.floor(carry);
      carry -= reads;
      let topic = "Mixed review";
      while (reads-- > 0 && next < cur.modules.length) {
        const m = cur.modules[next++];
        topic = topicName.get(m.topicId)!;
        await updateChapter(db, actor, m.id, { read: true }, d);
        // Questions and a score a day or two later; a review a few days after that.
        const qDay = addDays(d, Math.floor(rng() * 3));
        if (qDay <= lastDay && rng() < 0.9) {
          const acc = Math.round(clamp(p.accuracy(progress, topic) + (rng() - 0.5) * 18, 20, 100));
          const conf = p.overconfident ? 3 : acc >= 80 ? 3 : acc >= 60 ? 2 : 1;
          await updateChapter(db, actor, m.id, { practice: true, accuracy: rng() < 0.85 ? acc : null, confidence: rng() < 0.7 ? (conf as 1 | 2 | 3) : null }, qDay);
        }
        const rDay = addDays(d, 3 + Math.floor(rng() * 4));
        if (rDay <= lastDay && rng() < p.reviewProb) await updateChapter(db, actor, m.id, { review: true }, rDay);
      }
      await logSession(db, actor, { date: d, minutes, topic }, d);
    }
    for (const [daysAgo, score] of p.mocks) {
      const day = addDays(today, -daysAgo);
      if (day >= joinDay && day <= lastDay) await addMock(db, actor, { date: day, score, note: score < 60 ? "Struggled with time and the FSA questions." : "" }, day);
    }
    log(`  ${p.name}: ${next} chapters read, history logged`);
  }

  // Homework: two past, one open (chapters of the 2027 curriculum, sample questions).
  const mods = (...slugs: string[]) => slugs.map((s) => cur.moduleBySlug.get(s)!.id);
  const hwDefs = [
    { title: "Time value of money drill", modules: mods("quantitative-methods-02", "quantitative-methods-04", "quantitative-methods-05"), created: -27, due: -20, text: "In two or three sentences, explain why an annuity due is worth more than an ordinary annuity with the same payments." },
    { title: "Financial statements and ratios", modules: mods("financial-statement-analysis-03", "financial-statement-analysis-06", "financial-statement-analysis-07", "financial-statement-analysis-11"), created: -11, due: -4, text: null },
    { title: "Bond pricing basics", modules: mods("fixed-income-06", "fixed-income-10", "fixed-income-11", "fixed-income-14"), created: -2, due: 3, text: null },
  ];
  const hwIds: string[] = [];
  for (const h of hwDefs) {
    const created = at(addDays(today, h.created), 9);
    const { questionIds } = await assembleQuestions(db, teacher, { moduleIds: h.modules, count: 5 });
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
        dueAt: at(addDays(today, h.due), 21),
        target: { kind: "class" },
        policies: { showAnswers: "after_due", allowLate: true },
        items,
        assign: true,
      },
      created,
    );
    hwIds.push(a.id);
  }
  const bank = await db.select({ stem: questions.stem, correctKey: questions.correctKey, options: questions.options }).from(questions);
  const byStem = new Map(bank.map((q) => [q.stem, q]));
  for (const { actor, p } of students) {
    const joinDay = addDays(today, -(p.joinedDaysAgo ?? 35));
    for (const [i, id] of hwIds.entries()) {
      const h = hwDefs[i];
      if (p.skipsHomework?.includes(i)) continue;
      if (addDays(today, h.due) < joinDay) continue; // due before they joined
      if (h.due > 0 && rng() < 0.5) continue; // open homework: only some have done it
      const planned = addDays(today, p.lateHomework?.includes(i) ? h.due + 1 : h.due - 1 - Math.floor(rng() * 2));
      const day = planned > today ? today : planned;
      if (p.stoppedDaysAgo && day > addDays(today, -p.stoppedDaysAgo)) continue;
      const view = await getAssignmentForStudent(db, actor, id, at(day, 12));
      const answers = view.items.map((it) => {
        if (it.kind === "text") return { itemId: it.id, textAnswer: "Each payment arrives one period earlier, so every cash flow is discounted one period less." };
        const q = byStem.get(it.prompt ?? "");
        const ok = rng() < p.accuracy(0.5, "") / 100;
        return { itemId: it.id, chosenKey: q ? (ok ? q.correctKey : q.options.find((o) => o.key !== q.correctKey)!.key) : "A" };
      });
      await submitAssignment(db, actor, id, answers, new Date(Math.min(at(day, 20).getTime(), Date.now())));
    }
  }
  // The teacher grades the written answers on the first homework.
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
  return { created: true as const, classId: cls.id, joinCode: DEMO_JOIN_CODE };
}
