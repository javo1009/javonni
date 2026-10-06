// Admin-only operations: platform overview, accounts, curriculum view, question coverage and CSV import/export.
// Every function takes the authenticated actor and refuses anyone but an admin.

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  assignments,
  auditLog,
  classes,
  enrollments,
  files,
  curriculumVersions,
  modules,
  questions,
  topics,
  users,
} from "@/db/schema";
import {
  QUESTION_CSV,
  buildModuleIndex,
  duplicateKey,
  markDuplicates,
  parseQuestionCsv,
  summarise,
  toCsv,
  type AnalysedRow,
  type ModuleIndex,
} from "@/domain/question-csv";
import { hashPassword } from "@/lib/password";
import { FILE_LIMITS } from "./files";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type Actor,
  type Db,
  type Role,
} from "./types";
import { createUser } from "./users";

/** Temporary passwords (and resets) must be at least this long. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
/** A module with fewer published questions than this is flagged "needs more". */
export const MIN_QUESTIONS_PER_MODULE = 3;
/** Accounts seeded by `npm run db:seed` use this domain. */
export const DEMO_EMAIL_SUFFIX = "@ascent.demo";
export const USERS_PAGE_SIZE = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: Role[] = ["student", "teacher", "admin"];

/** Serialise account changes so two admins can't each disable "the other" admin. */
const USERS_LOCK = sql`select pg_advisory_xact_lock(hashtext('ascent.admin.users'))`;
/** Serialise question imports so two uploads of the same file can't both insert. */
const IMPORT_LOCK = sql`select pg_advisory_xact_lock(hashtext('ascent.admin.import'))`;

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin")
    throw new ForbiddenError("Only admins can do that.");
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function audit(
  db: Db | Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  await db
    .insert(auditLog)
    .values({ actorId: actor.id, action, entity, entityId, meta });
}

// ------------------------------------------------------- active curriculum

type ActiveRows = {
  version: {
    id: string;
    name: string;
    year: number;
    isSample: boolean;
    sourceNote: string | null;
    createdAt: Date;
  };
  topics: {
    id: string;
    code: string;
    name: string;
    weightMin: number;
    weightMax: number;
    studyWeeks: number;
    order: number;
  }[];
  modules: {
    id: string;
    topicId: string;
    number: number;
    title: string;
    slug: string;
  }[];
};

/** The active version with topic codes and module slugs (which the tracker's Curriculum type omits). Null when none is active. */
async function loadActive(db: Db | Tx): Promise<ActiveRows | null> {
  const [version] = await db
    .select({
      id: curriculumVersions.id,
      name: curriculumVersions.name,
      year: curriculumVersions.year,
      isSample: curriculumVersions.isSample,
      sourceNote: curriculumVersions.sourceNote,
      createdAt: curriculumVersions.createdAt,
    })
    .from(curriculumVersions)
    .where(eq(curriculumVersions.isActive, true))
    .limit(1);
  if (!version) return null;
  const topicRows = await db
    .select({
      id: topics.id,
      code: topics.code,
      name: topics.name,
      weightMin: topics.weightMin,
      weightMax: topics.weightMax,
      studyWeeks: topics.studyWeeks,
      order: topics.order,
    })
    .from(topics)
    .where(eq(topics.versionId, version.id))
    .orderBy(asc(topics.order));
  const moduleRows = topicRows.length
    ? await db
        .select({
          id: modules.id,
          topicId: modules.topicId,
          number: modules.number,
          title: modules.title,
          slug: modules.slug,
        })
        .from(modules)
        .where(
          inArray(
            modules.topicId,
            topicRows.map((t) => t.id),
          ),
        )
        .orderBy(asc(modules.number))
    : [];
  const codeById = new Map(topicRows.map((t) => [t.id, t.code]));
  return {
    version,
    topics: topicRows,
    modules: moduleRows.map((m) => ({
      ...m,
      slug:
        m.slug ??
        `${codeById.get(m.topicId)!.toLowerCase()}-${String(m.number).padStart(2, "0")}`,
    })),
  };
}

function moduleIndexOf(active: ActiveRows): ModuleIndex {
  const topicById = new Map(active.topics.map((t) => [t.id, t]));
  return buildModuleIndex(
    active.modules.map((m) => {
      const t = topicById.get(m.topicId)!;
      return {
        id: m.id,
        slug: m.slug,
        number: m.number,
        topicCode: t.code,
        topicName: t.name,
      };
    }),
  );
}

type CountRow = { moduleId: string; difficulty: number; n: number };

async function publishedCounts(db: Db | Tx): Promise<CountRow[]> {
  const rows = await db
    .select({
      moduleId: questions.moduleId,
      difficulty: questions.difficulty,
      n: sql<number>`count(*)::int`,
    })
    .from(questions)
    .where(
      and(eq(questions.status, "published"), isNotNull(questions.moduleId)),
    )
    .groupBy(questions.moduleId, questions.difficulty);
  return rows.map((r) => ({
    moduleId: r.moduleId!,
    difficulty: r.difficulty,
    n: r.n,
  }));
}

// ---------------------------------------------------------------- overview

export type AdminOverview = {
  users: Record<Role, { active: number; disabled: number }>;
  demoAccounts: number;
  classes: { active: number; archived: number };
  studentsEnrolled: number;
  assignments: { total: number; assigned: number; draft: number };
  files: {
    count: number;
    bytes: number;
    quotaPerUser: number;
    heaviest: { name: string; bytes: number } | null;
  };
  questions: {
    published: number;
    unpublished: number;
    bySource: { source: string; n: number }[];
  };
  modulesWithoutQuestions: {
    count: number;
    total: number;
    examples: { title: string; topic: string; number: number }[];
  };
  curriculum: {
    name: string;
    year: number;
    isSample: boolean;
    topics: number;
    modules: number;
  } | null;
  latest: { accountCreated: Date | null; questionAdded: Date | null };
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    actorName: string | null;
    createdAt: Date;
    meta: Record<string, unknown>;
  }[];
};

export async function adminOverview(
  db: Db,
  actor: Actor,
): Promise<AdminOverview> {
  assertAdmin(actor);
  const active = await loadActive(db);

  const [
    roleRows,
    [demo],
    [cls],
    [enr],
    [asg],
    [fileAgg],
    heaviest,
    qSource,
    [qStatus],
    [lastUser],
    [lastQuestion],
    counts,
    recent,
  ] = await Promise.all([
    db
      .select({
        role: users.role,
        active: sql<number>`count(*) filter (where ${users.disabledAt} is null)::int`,
        disabled: sql<number>`count(*) filter (where ${users.disabledAt} is not null)::int`,
      })
      .from(users)
      .groupBy(users.role),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(ilike(users.email, `%${DEMO_EMAIL_SUFFIX}`)),
    db
      .select({
        active: sql<number>`count(*) filter (where not ${classes.archived})::int`,
        archived: sql<number>`count(*) filter (where ${classes.archived})::int`,
      })
      .from(classes),
    db
      .select({ n: sql<number>`count(distinct ${enrollments.studentId})::int` })
      .from(enrollments)
      .innerJoin(
        classes,
        and(eq(classes.id, enrollments.classId), eq(classes.archived, false)),
      ),
    db
      .select({
        total: sql<number>`count(*)::int`,
        assigned: sql<number>`count(*) filter (where ${assignments.status} = 'assigned')::int`,
        draft: sql<number>`count(*) filter (where ${assignments.status} = 'draft')::int`,
      })
      .from(assignments),
    db
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${files.size}), 0)::float8`,
      })
      .from(files),
    db
      .select({
        name: users.name,
        bytes: sql<number>`sum(${files.size})::float8`,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.uploaderId))
      .groupBy(users.id, users.name)
      .orderBy(desc(sql`sum(${files.size})`))
      .limit(1),
    db
      .select({ source: questions.source, n: sql<number>`count(*)::int` })
      .from(questions)
      .where(eq(questions.status, "published"))
      .groupBy(questions.source)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        unpublished: sql<number>`count(*) filter (where ${questions.status} <> 'published')::int`,
      })
      .from(questions),
    db.select({ at: sql<Date | null>`max(${users.createdAt})` }).from(users),
    db
      .select({ at: sql<Date | null>`max(${questions.createdAt})` })
      .from(questions),
    publishedCounts(db),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
        actorName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt))
      .limit(6),
  ]);

  const byRole = Object.fromEntries(
    ROLES.map((r) => [r, { active: 0, disabled: 0 }]),
  ) as Record<Role, { active: number; disabled: number }>;
  for (const r of roleRows)
    byRole[r.role] = { active: r.active, disabled: r.disabled };

  const covered = new Set(counts.map((c) => c.moduleId));
  const topicById = new Map((active?.topics ?? []).map((t) => [t.id, t]));
  const empty = (active?.modules ?? []).filter((m) => !covered.has(m.id));
  const rank = new Map((active?.topics ?? []).map((t) => [t.id, t.order]));
  empty.sort(
    (a, b) =>
      rank.get(a.topicId)! - rank.get(b.topicId)! || a.number - b.number,
  );

  const asDate = (v: unknown) => (v ? new Date(v as string | Date) : null);
  return {
    users: byRole,
    demoAccounts: demo.n,
    classes: { active: cls.active, archived: cls.archived },
    studentsEnrolled: enr.n,
    assignments: { total: asg.total, assigned: asg.assigned, draft: asg.draft },
    files: {
      count: fileAgg.count,
      bytes: Number(fileAgg.bytes),
      quotaPerUser: FILE_LIMITS.perUserBytes,
      heaviest: heaviest[0]
        ? { name: heaviest[0].name, bytes: Number(heaviest[0].bytes) }
        : null,
    },
    questions: {
      published: qSource.reduce((s, r) => s + r.n, 0),
      unpublished: qStatus.unpublished,
      bySource: qSource,
    },
    modulesWithoutQuestions: {
      count: empty.length,
      total: active?.modules.length ?? 0,
      examples: empty
        .slice(0, 8)
        .map((m) => ({
          title: m.title,
          topic: topicById.get(m.topicId)!.name,
          number: m.number,
        })),
    },
    curriculum: active
      ? {
          name: active.version.name,
          year: active.version.year,
          isSample: active.version.isSample,
          topics: active.topics.length,
          modules: active.modules.length,
        }
      : null,
    latest: {
      accountCreated: asDate(lastUser.at),
      questionAdded: asDate(lastQuestion.at),
    },
    recentActivity: recent,
  };
}

// ------------------------------------------------------------------- users

export type AccountStatus = "active" | "disabled";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  disabledAt: Date | null;
  /** Teachers: classes they run. Students: classes they're in. */
  classes: number;
};

export type UserList = {
  rows: UserRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  activeAdmins: number;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listUsers(
  db: Db,
  actor: Actor,
  filter: {
    q?: string;
    role?: Role;
    status?: AccountStatus;
    page?: number;
  } = {},
): Promise<UserList> {
  assertAdmin(actor);
  const conds: SQL[] = [];
  const q = (filter.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(users.name, like), ilike(users.email, like))!);
  }
  if (filter.role && ROLES.includes(filter.role))
    conds.push(eq(users.role, filter.role));
  if (filter.status === "active") conds.push(isNull(users.disabledAt));
  if (filter.status === "disabled") conds.push(isNotNull(users.disabledAt));
  const where = conds.length ? and(...conds) : undefined;

  const [{ n: total }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(where);
  const [{ n: activeAdmins }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.disabledAt)));
  const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const page = Math.min(
    Math.max(1, Math.floor(filter.page ?? 1) || 1),
    pageCount,
  );

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      disabledAt: users.disabledAt,
      // Literal SQL: Drizzle prints column names unqualified in a single-table select, which would
      // make these correlated subqueries compare the inner table to itself.
      classes: sql<number>`case "users"."role"
        when 'teacher' then (select count(*)::int from "classes" c where c."teacher_id" = "users"."id" and not c."archived")
        when 'student' then (select count(*)::int from "enrollments" e where e."student_id" = "users"."id")
        else 0 end`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), asc(users.name), asc(users.id))
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE);
  return {
    rows,
    total,
    page,
    pageCount,
    pageSize: USERS_PAGE_SIZE,
    activeAdmins,
  };
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new ValidationError(
      `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new ValidationError(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
}

export async function createAccount(
  db: Db,
  actor: Actor,
  input: { name: string; email: string; role: Role; password: string },
) {
  assertAdmin(actor);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80)
    throw new ValidationError("Enter a name of 2 to 80 characters.");
  if (!EMAIL_RE.test(email) || email.length > 254)
    throw new ValidationError("Enter a valid email address.");
  if (!ROLES.includes(input.role)) throw new ValidationError("Pick a role.");
  checkPassword(input.password);
  const user = await createUser(db, {
    name,
    email,
    role: input.role,
    password: input.password,
  });
  await audit(db, actor, "user.create", "user", user.id, {
    role: user.role,
    email: user.email,
  });
  return user;
}

/**
 * Enable or disable an account. Refuses to disable yourself or the last active admin
 * (otherwise nobody could sign in to fix it). A disabled account is rejected on its next request.
 */
export async function setUserDisabled(
  db: Db,
  actor: Actor,
  userId: string,
  disabled: boolean,
): Promise<{ name: string; disabled: boolean }> {
  assertAdmin(actor);
  if (!UUID_RE.test(userId))
    throw new NotFoundError("That account no longer exists.");
  return db.transaction(async (tx) => {
    await tx.execute(USERS_LOCK);
    const [u] = await tx
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) throw new NotFoundError("That account no longer exists.");
    if (disabled) {
      if (u.id === actor.id)
        throw new ValidationError("You can't disable your own account.");
      if (u.role === "admin" && !u.disabledAt) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, "admin"), isNull(users.disabledAt)));
        if (n <= 1)
          throw new ValidationError(
            "This is the last active admin. Create or enable another admin first.",
          );
      }
    }
    if (!!u.disabledAt !== disabled) {
      await tx
        .update(users)
        .set({ disabledAt: disabled ? new Date() : null })
        .where(eq(users.id, u.id));
      await audit(
        tx,
        actor,
        disabled ? "user.disable" : "user.enable",
        "user",
        u.id,
        { role: u.role },
      );
    }
    return { name: u.name, disabled };
  });
}

/** Set a new temporary password. The person should change it after signing in. */
export async function resetUserPassword(
  db: Db,
  actor: Actor,
  userId: string,
  newPassword: string,
): Promise<{ name: string; email: string }> {
  assertAdmin(actor);
  if (!UUID_RE.test(userId))
    throw new NotFoundError("That account no longer exists.");
  checkPassword(newPassword);
  const passwordHash = await hashPassword(newPassword);
  const [u] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name, email: users.email });
  if (!u) throw new NotFoundError("That account no longer exists.");
  await audit(db, actor, "user.password_reset", "user", u.id);
  return { name: u.name, email: u.email };
}

// -------------------------------------------------------------- curriculum

export type CurriculumView = {
  version: ActiveRows["version"];
  topics: {
    id: string;
    code: string;
    name: string;
    weightMin: number;
    weightMax: number;
    studyWeeks: number;
    questionCount: number;
    modules: {
      id: string;
      number: number;
      title: string;
      slug: string;
      questionCount: number;
    }[];
  }[];
  totals: {
    topics: number;
    modules: number;
    studyWeeks: number;
    questions: number;
  };
};

export async function adminCurriculum(
  db: Db,
  actor: Actor,
): Promise<CurriculumView | null> {
  assertAdmin(actor);
  const active = await loadActive(db);
  if (!active) return null;
  const per = new Map<string, number>();
  for (const c of await publishedCounts(db))
    per.set(c.moduleId, (per.get(c.moduleId) ?? 0) + c.n);
  const view = active.topics.map((t) => {
    const mods = active.modules
      .filter((m) => m.topicId === t.id)
      .sort((a, b) => a.number - b.number)
      .map((m) => ({
        id: m.id,
        number: m.number,
        title: m.title,
        slug: m.slug,
        questionCount: per.get(m.id) ?? 0,
      }));
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      weightMin: t.weightMin,
      weightMax: t.weightMax,
      studyWeeks: t.studyWeeks,
      questionCount: mods.reduce((s, m) => s + m.questionCount, 0),
      modules: mods,
    };
  });
  return {
    version: active.version,
    topics: view,
    totals: {
      topics: view.length,
      modules: active.modules.length,
      studyWeeks: view.reduce((s, t) => s + t.studyWeeks, 0),
      questions: view.reduce((s, t) => s + t.questionCount, 0),
    },
  };
}

// ---------------------------------------------------------------- coverage

export type CoverageStatus = "none" | "low" | "ok";

export type CoverageView = {
  versionName: string;
  min: number;
  topics: {
    id: string;
    code: string;
    name: string;
    total: number;
    needing: number;
    modules: {
      id: string;
      number: number;
      title: string;
      slug: string;
      total: number;
      byDifficulty: [number, number, number];
      status: CoverageStatus;
    }[];
  }[];
  totals: {
    published: number;
    modules: number;
    covered: number;
    low: number;
    none: number;
    byDifficulty: [number, number, number];
    bySource: { source: string; n: number }[];
  };
  /** Published questions not attached to a module of the active curriculum. */
  unmapped: number;
};

export async function adminCoverage(
  db: Db,
  actor: Actor,
): Promise<CoverageView | null> {
  assertAdmin(actor);
  const active = await loadActive(db);
  if (!active) return null;
  const counts = await publishedCounts(db);
  const bySource = await db
    .select({ source: questions.source, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(eq(questions.status, "published"))
    .groupBy(questions.source)
    .orderBy(desc(sql`count(*)`));
  const per = new Map<string, [number, number, number]>();
  for (const c of counts) {
    const row = per.get(c.moduleId) ?? [0, 0, 0];
    row[Math.min(3, Math.max(1, c.difficulty)) - 1] += c.n;
    per.set(c.moduleId, row);
  }
  const statusOf = (n: number): CoverageStatus =>
    n === 0 ? "none" : n < MIN_QUESTIONS_PER_MODULE ? "low" : "ok";
  const totals = {
    published: 0,
    modules: active.modules.length,
    covered: 0,
    low: 0,
    none: 0,
    byDifficulty: [0, 0, 0] as [number, number, number],
  };
  let mapped = 0;
  const topicsView = active.topics.map((t) => {
    const mods = active.modules
      .filter((m) => m.topicId === t.id)
      .sort((a, b) => a.number - b.number)
      .map((m) => {
        const d = per.get(m.id) ?? [0, 0, 0];
        const total = d[0] + d[1] + d[2];
        const status = statusOf(total);
        mapped += total;
        totals.byDifficulty[0] += d[0];
        totals.byDifficulty[1] += d[1];
        totals.byDifficulty[2] += d[2];
        if (status === "ok") totals.covered++;
        else if (status === "low") totals.low++;
        else totals.none++;
        return {
          id: m.id,
          number: m.number,
          title: m.title,
          slug: m.slug,
          total,
          byDifficulty: d,
          status,
        };
      });
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      total: mods.reduce((s, m) => s + m.total, 0),
      needing: mods.filter((m) => m.status !== "ok").length,
      modules: mods,
    };
  });
  totals.published = bySource.reduce((s, r) => s + r.n, 0);
  return {
    versionName: active.version.name,
    min: MIN_QUESTIONS_PER_MODULE,
    topics: topicsView,
    totals: { ...totals, bySource },
    unmapped: Math.max(0, totals.published - mapped),
  };
}

// ------------------------------------------------------------ question CSV

export type ImportPreviewRow = {
  row: number;
  line: number;
  status: "ok" | "duplicate" | "error";
  module: string;
  /** Resolved module, for ok / duplicate rows. */
  moduleLabel?: string;
  stem: string;
  correctKey?: string;
  difficulty?: number;
  errors: string[];
  note?: string;
};

export type ImportPreview = {
  fileErrors: string[];
  fileWarnings: string[];
  counts: { total: number; ok: number; duplicates: number; errors: number };
  rows: ImportPreviewRow[];
  /** Questions that would be added, per module slug. */
  perModule: { slug: string; title: string; n: number }[];
};

async function analyse(db: Db | Tx, csv: string) {
  const active = await loadActive(db);
  if (!active)
    throw new NotFoundError(
      "No active curriculum. Run the deploy setup first.",
    );
  const index = moduleIndexOf(active);
  const parsed = parseQuestionCsv(csv, index);
  let rows: AnalysedRow[] = [];
  if (parsed.fileErrors.length === 0) {
    const existing = await db
      .select({ moduleId: questions.moduleId, stem: questions.stem })
      .from(questions)
      .where(
        inArray(
          questions.moduleId,
          active.modules.map((m) => m.id),
        ),
      );
    rows = markDuplicates(
      parsed.rows,
      new Set(existing.map((e) => duplicateKey(e.moduleId!, e.stem))),
    );
  }
  return { active, parsed, rows };
}

/** Parse and validate a CSV without writing anything. */
export async function previewQuestionImport(
  db: Db,
  actor: Actor,
  csv: string,
): Promise<ImportPreview> {
  assertAdmin(actor);
  const { active, parsed, rows } = await analyse(db, csv);
  const titleBySlug = new Map(active.modules.map((m) => [m.slug, m.title]));
  const perSlug = new Map<string, number>();
  const out: ImportPreviewRow[] = rows.map((r) => {
    if (r.status === "error")
      return {
        row: r.row,
        line: r.line,
        status: "error",
        module: r.module,
        stem: r.stem,
        errors: r.errors,
      };
    const d = r.draft;
    const base = {
      row: r.row,
      line: r.line,
      module: r.module,
      moduleLabel: d.moduleSlug,
      stem: d.stem.slice(0, 160),
      correctKey: d.correctKey,
      difficulty: d.difficulty,
      errors: [] as string[],
    };
    if (r.status === "duplicate") {
      return {
        ...base,
        status: "duplicate",
        note:
          r.of === "bank"
            ? "Already in the question bank (same module and stem). It will be skipped."
            : `Same as row ${r.of.row} in this file. It will be skipped.`,
      };
    }
    perSlug.set(d.moduleSlug, (perSlug.get(d.moduleSlug) ?? 0) + 1);
    return { ...base, status: "ok" };
  });
  return {
    fileErrors: parsed.fileErrors,
    fileWarnings: parsed.fileWarnings,
    counts: summarise(rows),
    rows: out,
    perModule: [...perSlug]
      .map(([slug, n]) => ({ slug, title: titleBySlug.get(slug) ?? slug, n }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

export type ImportResult = {
  imported: number;
  skippedInvalid: number;
  skippedDuplicates: number;
};

/**
 * Import the valid rows of a question CSV as published questions (source "imported").
 * Everything is re-validated here; the preview is never trusted. Without `skipInvalid`, any
 * invalid row aborts the whole import. Duplicates (same module and stem) are always skipped.
 */
export async function importQuestions(
  db: Db,
  actor: Actor,
  csv: string,
  opts: { skipInvalid: boolean },
): Promise<ImportResult> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await tx.execute(IMPORT_LOCK);
    const { parsed, rows } = await analyse(tx, csv);
    if (parsed.fileErrors.length)
      throw new ValidationError(parsed.fileErrors[0]);
    const s = summarise(rows);
    if (s.errors > 0 && !opts.skipInvalid) {
      throw new ValidationError(
        `${s.errors} ${s.errors === 1 ? "row has" : "rows have"} errors, so nothing was imported. Fix the file, or choose to skip invalid rows.`,
      );
    }
    const good = rows.flatMap((r) => (r.status === "ok" ? [r.draft] : []));
    if (good.length === 0)
      throw new ValidationError(
        s.duplicates > 0
          ? "Every valid row is already in the question bank. Nothing to import."
          : "There are no valid questions to import.",
      );
    await tx.insert(questions).values(
      good.map((d) => ({
        stem: d.stem,
        options: d.options,
        correctKey: d.correctKey,
        explanation: d.explanation,
        difficulty: d.difficulty,
        status: "published" as const,
        moduleId: d.moduleId,
        source: "imported",
        authorId: actor.id,
      })),
    );
    const labels = [
      ...new Set(good.map((d) => d.source).filter(Boolean)),
    ].slice(0, 10);
    await audit(tx, actor, "questions.import", "question", null, {
      imported: good.length,
      skippedInvalid: s.errors,
      skippedDuplicates: s.duplicates,
      sourceLabels: labels,
    });
    return {
      imported: good.length,
      skippedInvalid: s.errors,
      skippedDuplicates: s.duplicates,
    };
  });
}

/** The published question bank as CSV (same columns as the import template; formula-safe). */
export async function exportQuestionBank(
  db: Db,
  actor: Actor,
): Promise<string> {
  assertAdmin(actor);
  const rows = await db
    .select({
      slug: modules.slug,
      stem: questions.stem,
      options: questions.options,
      correctKey: questions.correctKey,
      explanation: questions.explanation,
      difficulty: questions.difficulty,
      source: questions.source,
    })
    .from(questions)
    .leftJoin(modules, eq(modules.id, questions.moduleId))
    .where(eq(questions.status, "published"))
    .orderBy(asc(modules.slug), asc(questions.createdAt), asc(questions.id));
  const opt = (o: { key: string; text: string }[], k: string) =>
    o.find((x) => x.key === k)?.text ?? "";
  return toCsv(
    [
      [...QUESTION_CSV.columns],
      ...rows.map((r) => [
        r.slug ?? "",
        r.stem,
        opt(r.options, "A"),
        opt(r.options, "B"),
        opt(r.options, "C"),
        opt(r.options, "D"),
        r.correctKey,
        r.explanation,
        r.difficulty,
        r.source,
      ]),
    ],
    { bom: true },
  );
}
