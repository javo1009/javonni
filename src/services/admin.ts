// Admin-only operations: curriculum import and versions, coverage, staff accounts.
// Every function takes the authenticated actor and refuses anyone but an admin.
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { writeCurriculum } from "@/db/curriculum-writer";
import { auditLog, classes, curriculumVersions, enrollments, los, modules, planItems, questions, studyPlans, topics, users } from "@/db/schema";
import {
  diffCurricula,
  draftStats,
  parseCurriculumCsv,
  type CsvIssue,
  type CurriculumDiff,
  type CurriculumShape,
  type DraftStats,
} from "@/domain/curriculum-csv";
import { getActiveCurriculum, questionCountsByLos, type Curriculum } from "./curriculum";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db, type Role } from "./types";
import { createUser, type PublicUser } from "./users";

/** Minimum published questions per objective before it counts as covered (PLAN §1.1 G1, MVP). */
export const MIN_QUESTIONS_PER_LOS = 3;
export const MIN_PASSWORD_LENGTH = 10;
/** Upper bound on pasted/uploaded CSV size (server actions accept ~1 MB bodies by default). */
export const MAX_CSV_BYTES = 900_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Serialises activations so two concurrent requests can't leave two active versions. */
const ACTIVATE_LOCK = sql`select pg_advisory_xact_lock(hashtext('ascent.curriculum.activate'))`;

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new ForbiddenError("Only admins can do that.");
}

async function audit(db: Db, actor: Actor | null, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actorId: actor?.id ?? null, action, entity, entityId, meta });
}

/** A loaded curriculum in the shape the CSV diff understands. */
export function curriculumShape(c: Curriculum): CurriculumShape & { topics: (CurriculumShape["topics"][number] & { difficulty: number; spread: boolean })[] } {
  const losById = new Map(c.los.map((l) => [l.id, l]));
  return {
    topics: c.topics.map((t) => ({
      code: t.code,
      name: t.name,
      weightMin: t.weightMin,
      weightMax: t.weightMax,
      difficulty: t.difficulty,
      spread: t.spread,
      modules: c.modules
        .filter((m) => m.topicId === t.id)
        .map((m) => ({
          title: m.title,
          estMinutes: m.estMinutes,
          los: m.losIds.map((id) => {
            const l = losById.get(id)!;
            return { code: l.code, commandWord: l.commandWord, text: l.text, importance: l.importance };
          }),
        })),
    })),
  };
}

async function activeCurriculumOrNull(db: Db): Promise<Curriculum | null> {
  try {
    return await getActiveCurriculum(db);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

// --------------------------------------------------------------- overview

export async function adminOverview(db: Db, actor: Actor) {
  assertAdmin(actor);
  const roleRows = await db
    .select({ role: users.role, n: count() })
    .from(users)
    .where(isNull(users.disabledAt))
    .groupBy(users.role);
  const byRole = Object.fromEntries(roleRows.map((r) => [r.role, r.n])) as Partial<Record<Role, number>>;
  const [[cls], qRows, [versions], [plans]] = await Promise.all([
    db.select({ n: count() }).from(classes).where(eq(classes.archived, false)),
    db.select({ status: questions.status, n: count() }).from(questions).groupBy(questions.status),
    db.select({ n: count() }).from(curriculumVersions),
    db.select({ n: count() }).from(studyPlans).where(eq(studyPlans.active, true)),
  ]);
  const q = Object.fromEntries(qRows.map((r) => [r.status, r.n])) as Partial<Record<"draft" | "review" | "published", number>>;
  const c = await activeCurriculumOrNull(db);
  return {
    students: byRole.student ?? 0,
    teachers: byRole.teacher ?? 0,
    admins: byRole.admin ?? 0,
    classes: cls.n,
    questions: { published: q.published ?? 0, unpublished: (q.draft ?? 0) + (q.review ?? 0) },
    versions: versions.n,
    activePlans: plans.n,
    active: c
      ? {
          id: c.version.id,
          name: c.version.name,
          year: c.version.year,
          isSample: c.version.isSample,
          sourceNote: c.version.sourceNote,
          topics: c.topics.length,
          modules: c.modules.length,
          los: c.los.length,
        }
      : null,
  };
}

export async function recentAudit(db: Db, actor: Actor, limit = 10) {
  assertAdmin(actor);
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

// ------------------------------------------------------------- curriculum

export type ImportPreview = {
  errors: CsvIssue[];
  warnings: CsvIssue[];
  stats: DraftStats;
  topics: { code: string; name: string; weightMin: number; weightMax: number; modules: number; los: number }[];
  /** Null when there is no active version to compare against. */
  diff: CurriculumDiff | null;
  against: { id: string; name: string; isSample: boolean } | null;
};

function checkCsvSize(csvText: string) {
  if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
    throw new ValidationError(`That file is larger than ${Math.round(MAX_CSV_BYTES / 1000)} KB. Split it or remove unused columns.`);
  }
}

/** Parse a CSV and compare it with the active version. Writes nothing. */
export async function previewImport(db: Db, actor: Actor, csvText: string): Promise<ImportPreview> {
  assertAdmin(actor);
  checkCsvSize(csvText);
  const { draft, errors, warnings } = parseCurriculumCsv(csvText);
  const active = await activeCurriculumOrNull(db);
  return {
    errors,
    warnings,
    stats: draftStats(draft),
    topics: draft.topics.map((t) => ({
      code: t.code,
      name: t.name,
      weightMin: t.weightMin,
      weightMax: t.weightMax,
      modules: t.modules.length,
      los: t.modules.reduce((s, m) => s + m.los.length, 0),
    })),
    diff: active ? diffCurricula(curriculumShape(active), draft) : null,
    against: active ? { id: active.version.id, name: active.version.name, isSample: active.version.isSample } : null,
  };
}

export type ImportOptions = { activate: boolean; name: string; year: number; sourceNote?: string | null };

function validateImportOptions(o: ImportOptions) {
  const name = o.name?.trim() ?? "";
  if (name.length < 3 || name.length > 120) throw new ValidationError("Give the version a name of 3 to 120 characters.");
  if (!Number.isInteger(o.year) || o.year < 2000 || o.year > 2100) throw new ValidationError("Enter the curriculum year, for example 2027.");
  const note = o.sourceNote?.trim() || null;
  if (note && note.length > 1000) throw new ValidationError("Keep the source note under 1000 characters.");
  return { name, year: o.year, sourceNote: note };
}

/**
 * Create a new curriculum version from CSV. Refuses files with errors. With
 * `activate`, the new version becomes the one new plans use; existing student
 * plans keep pointing at the version they were built from.
 */
export async function importCurriculum(db: Db, actor: Actor, csvText: string, opts: ImportOptions) {
  assertAdmin(actor);
  return doImport(db, actor, csvText, opts, "admin");
}

/**
 * The same import for trusted operator tooling (scripts/import-curriculum.ts),
 * which runs with direct database credentials and no signed-in user. The audit
 * entry has no actor and records `source: "cli"`. Never call this from a request path.
 */
export async function importCurriculumFromCli(db: Db, csvText: string, opts: ImportOptions) {
  return doImport(db, null, csvText, opts, "cli");
}

async function doImport(db: Db, actor: Actor | null, csvText: string, opts: ImportOptions, source: "admin" | "cli") {
  checkCsvSize(csvText);
  const meta = validateImportOptions(opts);
  const { draft, errors, warnings } = parseCurriculumCsv(csvText, { name: meta.name, year: meta.year, sourceNote: meta.sourceNote });
  if (errors.length > 0) {
    throw new ValidationError(`The CSV has ${errors.length === 1 ? "1 error" : `${errors.length} errors`}. Fix them and preview again before importing.`);
  }
  const stats = draftStats(draft);
  if (stats.los === 0) throw new ValidationError("The CSV has no objectives.");

  const previous = await activeCurriculumOrNull(db);
  const diff = previous ? diffCurricula(curriculumShape(previous), draft) : null;

  return db.transaction(async (tx) => {
    if (opts.activate) await tx.execute(ACTIVATE_LOCK);
    // writeCurriculum opens its own transaction; inside ours it becomes a savepoint,
    // so the version, its rows and the audit entry commit together.
    const written = await writeCurriculum(tx as unknown as Db, draft, { activate: opts.activate });
    await audit(tx as unknown as Db, actor, "curriculum.import", "curriculum_version", written.versionId, {
      name: meta.name,
      year: meta.year,
      activated: opts.activate,
      source,
      ...stats,
      warnings: warnings.length,
      previousActiveId: previous?.version.id ?? null,
      diff: diff && {
        added: diff.addedLos.length,
        removed: diff.removedLos.length,
        reworded: diff.rewordedLos.length,
        moved: diff.movedLos.length,
      },
    });
    return { versionId: written.versionId, activated: opts.activate, stats, warnings: warnings.length };
  });
}

export type VersionRow = {
  id: string;
  name: string;
  level: string;
  year: number;
  isSample: boolean;
  isActive: boolean;
  sourceNote: string | null;
  createdAt: Date;
  topics: number;
  los: number;
  activePlans: number;
};

export async function listVersions(db: Db, actor: Actor): Promise<VersionRow[]> {
  assertAdmin(actor);
  const versions = await db.select().from(curriculumVersions).orderBy(desc(curriculumVersions.isActive), desc(curriculumVersions.createdAt));
  if (versions.length === 0) return [];
  const ids = versions.map((v) => v.id);
  const [topicCounts, losCounts, planCounts] = await Promise.all([
    db.select({ id: topics.versionId, n: count() }).from(topics).where(inArray(topics.versionId, ids)).groupBy(topics.versionId),
    db
      .select({ id: topics.versionId, n: count() })
      .from(los)
      .innerJoin(modules, eq(modules.id, los.moduleId))
      .innerJoin(topics, eq(topics.id, modules.topicId))
      .where(inArray(topics.versionId, ids))
      .groupBy(topics.versionId),
    db
      .select({ id: studyPlans.versionId, n: count() })
      .from(studyPlans)
      .where(and(inArray(studyPlans.versionId, ids), eq(studyPlans.active, true)))
      .groupBy(studyPlans.versionId),
  ]);
  const m = (rows: { id: string; n: number }[]) => new Map(rows.map((r) => [r.id, r.n]));
  const [tc, lc, pc] = [m(topicCounts), m(losCounts), m(planCounts)];
  return versions.map((v) => ({
    id: v.id,
    name: v.name,
    level: v.level,
    year: v.year,
    isSample: v.isSample,
    isActive: v.isActive,
    sourceNote: v.sourceNote,
    createdAt: v.createdAt,
    topics: tc.get(v.id) ?? 0,
    los: lc.get(v.id) ?? 0,
    activePlans: pc.get(v.id) ?? 0,
  }));
}

/** Make a version the one new plans are built from. Existing plans keep their own version. */
export async function activateVersion(db: Db, actor: Actor, versionId: string) {
  assertAdmin(actor);
  if (!UUID_RE.test(versionId)) throw new NotFoundError("That curriculum version doesn't exist.");
  return db.transaction(async (tx) => {
    await tx.execute(ACTIVATE_LOCK);
    const [target] = await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, versionId)).limit(1);
    if (!target) throw new NotFoundError("That curriculum version doesn't exist.");
    if (target.isActive) return { changed: false, name: target.name };
    const previous = await tx.select({ id: curriculumVersions.id }).from(curriculumVersions).where(eq(curriculumVersions.isActive, true));
    await tx.update(curriculumVersions).set({ isActive: false }).where(eq(curriculumVersions.isActive, true));
    await tx.update(curriculumVersions).set({ isActive: true }).where(eq(curriculumVersions.id, versionId));
    await audit(tx as unknown as Db, actor, "curriculum.activate", "curriculum_version", versionId, {
      name: target.name,
      previousActiveIds: previous.map((p) => p.id),
    });
    return { changed: true, name: target.name };
  });
}

/** A whole version, for CSV export. */
export async function getVersionForExport(db: Db, actor: Actor, versionId: string) {
  assertAdmin(actor);
  if (!UUID_RE.test(versionId)) throw new NotFoundError("That curriculum version doesn't exist.");
  const c = await getActiveCurriculum(db, versionId);
  return { version: c.version, shape: curriculumShape(c) };
}

// --------------------------------------------------------------- coverage

export type CoverageRow = {
  losId: string;
  code: string;
  text: string;
  commandWord: string;
  importance: 1 | 2 | 3;
  topicId: string;
  topicCode: string;
  topicName: string;
  moduleTitle: string;
  questions: number;
  /** Has a read or practice task in at least one active student plan on this version. */
  inActivePlan: boolean;
  belowMin: boolean;
};

export type CoverageReport = {
  version: { id: string; name: string; isSample: boolean };
  minQuestions: number;
  activePlans: number;
  rows: CoverageRow[];
  summary: {
    totalLos: number;
    covered: number;
    belowMin: number;
    zeroQuestions: number;
    questionsNeeded: number;
    /** Only meaningful when activePlans > 0. */
    notInAnyPlan: number;
    topics: { id: string; code: string; name: string; los: number; belowMin: number; notInAnyPlan: number }[];
  };
};

export async function coverageReport(db: Db, actor: Actor, opts: { minQuestions?: number } = {}): Promise<CoverageReport | null> {
  assertAdmin(actor);
  const min = opts.minQuestions ?? MIN_QUESTIONS_PER_LOS;
  const c = await activeCurriculumOrNull(db);
  if (!c) return null;

  const plannedLos = sql<string>`jsonb_array_elements_text(${planItems.losIds})`;
  const [counts, planned, [plans]] = await Promise.all([
    questionCountsByLos(db),
    db
      .selectDistinct({ losId: plannedLos })
      .from(planItems)
      .innerJoin(studyPlans, and(eq(studyPlans.id, planItems.planId), eq(studyPlans.active, true), eq(studyPlans.versionId, c.version.id)))
      .where(inArray(planItems.type, ["read", "practice"])),
    db
      .select({ n: count() })
      .from(studyPlans)
      .where(and(eq(studyPlans.active, true), eq(studyPlans.versionId, c.version.id))),
  ]);
  const plannedSet = new Set(planned.map((p) => p.losId));
  const topicById = new Map(c.topics.map((t) => [t.id, t]));
  const moduleById = new Map(c.modules.map((m) => [m.id, m]));
  const losById = new Map(c.los.map((l) => [l.id, l]));

  const rows: CoverageRow[] = [];
  // Curriculum order: topic, module, objective.
  for (const m of c.modules) {
    const t = topicById.get(m.topicId)!;
    for (const id of m.losIds) {
      const l = losById.get(id)!;
      const n = counts.get(id) ?? 0;
      rows.push({
        losId: id,
        code: l.code,
        text: l.text,
        commandWord: l.commandWord,
        importance: l.importance,
        topicId: t.id,
        topicCode: t.code,
        topicName: t.name,
        moduleTitle: moduleById.get(l.moduleId)!.title,
        questions: n,
        inActivePlan: plannedSet.has(id),
        belowMin: n < min,
      });
    }
  }
  const topicSummary = c.topics.map((t) => {
    const r = rows.filter((x) => x.topicId === t.id);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      los: r.length,
      belowMin: r.filter((x) => x.belowMin).length,
      notInAnyPlan: plans.n > 0 ? r.filter((x) => !x.inActivePlan).length : 0,
    };
  });
  const belowMin = rows.filter((r) => r.belowMin);
  return {
    version: { id: c.version.id, name: c.version.name, isSample: c.version.isSample },
    minQuestions: min,
    activePlans: plans.n,
    rows,
    summary: {
      totalLos: rows.length,
      covered: rows.length - belowMin.length,
      belowMin: belowMin.length,
      zeroQuestions: rows.filter((r) => r.questions === 0).length,
      questionsNeeded: belowMin.reduce((s, r) => s + (min - r.questions), 0),
      notInAnyPlan: plans.n > 0 ? rows.filter((r) => !r.inActivePlan).length : 0,
      topics: topicSummary,
    },
  };
}

// ------------------------------------------------------------------ users

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  disabledAt: Date | null;
  /** Classes taught (teachers) or joined (students). */
  classes: number;
};

export async function listUsers(db: Db, actor: Actor, filter: { role?: Role; q?: string } = {}): Promise<UserRow[]> {
  assertAdmin(actor);
  const conds = [];
  if (filter.role) conds.push(eq(users.role, filter.role));
  const q = filter.q?.trim().toLowerCase().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    conds.push(sql`(lower(${users.email}) like ${like} or lower(${users.name}) like ${like})`);
  }
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(users.role), asc(users.name)) // admins, teachers, then students
    .limit(1000);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [taught, joined] = await Promise.all([
    db.select({ id: classes.teacherId, n: count() }).from(classes).where(and(inArray(classes.teacherId, ids), eq(classes.archived, false))).groupBy(classes.teacherId),
    db.select({ id: enrollments.studentId, n: count() }).from(enrollments).where(inArray(enrollments.studentId, ids)).groupBy(enrollments.studentId),
  ]);
  const t = new Map(taught.map((r) => [r.id, r.n]));
  const j = new Map(joined.map((r) => [r.id, r.n]));
  return rows.map((r) => ({ ...r, classes: (r.role === "student" ? j.get(r.id) : t.get(r.id)) ?? 0 }));
}

/** Random, readable initial password (no look-alike characters). */
export function generatePassword(length = 16): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  // 256 % 56 != 0, so reject the biased tail to keep the choice uniform.
  for (let i = 0; out.length < length; i++) {
    const b = i < bytes.length ? bytes[i] : randomBytes(1)[0];
    if (b < 224) out += alphabet[b % alphabet.length];
  }
  return out;
}

/**
 * Create a teacher (or another admin). Students self-register with a class code.
 * Leave `password` empty to generate one; it is returned once so it can be handed over.
 */
export async function createTeacher(
  db: Db,
  actor: Actor,
  input: { email: string; name: string; role?: "teacher" | "admin"; password?: string; timezone?: string },
): Promise<{ user: PublicUser; generatedPassword: string | null }> {
  assertAdmin(actor);
  const role = input.role ?? "teacher";
  if (role !== "teacher" && role !== "admin") throw new ValidationError("Staff accounts are teachers or admins. Students join with a class code.");
  const email = input.email?.trim() ?? "";
  if (!EMAIL_RE.test(email) || email.length > 200) throw new ValidationError("Enter a valid email address.");
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 80) throw new ValidationError("Enter a name of 2 to 80 characters.");
  let password = input.password ?? "";
  let generated: string | null = null;
  if (!password) {
    generated = generatePassword();
    password = generated;
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters, or leave it blank to generate one.`);
  } else if (password.length > 200) {
    throw new ValidationError("That password is too long.");
  }
  const user = await createUser(db, { email, name, role, password, timezone: input.timezone });
  await audit(db, actor, "user.create", "user", user.id, { role, email: user.email });
  return { user, generatedPassword: generated };
}

/** Disable or re-enable an account. Disabled users are signed out on their next request. */
export async function setUserDisabled(db: Db, actor: Actor, userId: string, disabled: boolean) {
  assertAdmin(actor);
  if (userId === actor.id) throw new ValidationError("You can't disable your own account.");
  if (!UUID_RE.test(userId)) throw new NotFoundError("That user doesn't exist.");
  const [row] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt });
  if (!row) throw new NotFoundError("That user doesn't exist.");
  await audit(db, actor, disabled ? "user.disable" : "user.enable", "user", row.id, { email: row.email, role: row.role });
  return row;
}
