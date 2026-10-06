import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);
export const questionStatusEnum = pgEnum("question_status", ["draft", "review", "published"]);
export const planItemStatusEnum = pgEnum("plan_item_status", ["todo", "done", "skipped"]);
export const attemptModeEnum = pgEnum("attempt_mode", ["practice", "timed", "mock", "homework"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["draft", "assigned"]);
export const submissionStatusEnum = pgEnum("submission_status", ["in_progress", "submitted", "graded"]);

// ---------------------------------------------------------------- identity
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    name: text("name").notNull(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    joinCode: text("join_code").notNull(),
    examDate: date("exam_date", { mode: "string" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("classes_join_code_uq").on(t.joinCode), index("classes_teacher_idx").on(t.teacherId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentId] }), index("enrollments_student_idx").on(t.studentId)],
);

// -------------------------------------------------------------- curriculum
export const curriculumVersions = pgTable("curriculum_versions", {
  id: id(),
  name: text("name").notNull(),
  level: text("level").notNull().default("I"),
  year: integer("year").notNull(),
  /** True for the bundled demo curriculum; the UI shows a banner while active. */
  isSample: boolean("is_sample").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  sourceNote: text("source_note"),
  createdAt: createdAt(),
});

export const topics = pgTable(
  "topics",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    weightMin: integer("weight_min").notNull(),
    weightMax: integer("weight_max").notNull(),
    order: integer("order").notNull(),
    difficulty: integer("difficulty").notNull().default(2),
    spread: boolean("spread").notNull().default(false),
  },
  (t) => [uniqueIndex("topics_version_code_uq").on(t.versionId, t.code)],
);

export const modules = pgTable(
  "modules",
  {
    id: id(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    order: integer("order").notNull(),
    estMinutes: integer("est_minutes").notNull().default(180),
  },
  (t) => [index("modules_topic_idx").on(t.topicId)],
);

export const los = pgTable(
  "los",
  {
    id: id(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    commandWord: text("command_word").notNull(),
    text: text("text").notNull(),
    importance: integer("importance").notNull().default(2),
    order: integer("order").notNull(),
  },
  (t) => [uniqueIndex("los_module_code_uq").on(t.moduleId, t.code)],
);

// ----------------------------------------------------------------- content
export const questions = pgTable("questions", {
  id: id(),
  stem: text("stem").notNull(),
  options: jsonb("options").$type<{ key: string; text: string }[]>().notNull(),
  correctKey: text("correct_key").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull().default(2),
  status: questionStatusEnum("status").notNull().default("draft"),
  authorId: uuid("author_id").references(() => users.id),
  createdAt: createdAt(),
});

export const questionLos = pgTable(
  "question_los",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    losId: uuid("los_id")
      .notNull()
      .references(() => los.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.losId] }), index("question_los_los_idx").on(t.losId)],
);

// -------------------------------------------------------------------- plan
export const studyPlans = pgTable(
  "study_plans",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => curriculumVersions.id),
    startDate: date("start_date", { mode: "string" }).notNull(),
    examDate: date("exam_date", { mode: "string" }).notNull(),
    weeklyMinutes: jsonb("weekly_minutes").$type<number[]>().notNull(),
    blackoutDates: jsonb("blackout_dates").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    warnings: jsonb("warnings").$type<{ code: string; message: string }[]>().notNull().default([]),
    summary: jsonb("summary").$type<Record<string, number | string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("study_plans_student_idx").on(t.studentId, t.active)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => studyPlans.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    phase: text("phase").notNull(),
    title: text("title").notNull(),
    minutes: integer("minutes").notNull(),
    topicId: uuid("topic_id").references(() => topics.id),
    moduleId: uuid("module_id").references(() => modules.id),
    losIds: jsonb("los_ids").$type<string[]>().notNull().default([]),
    part: integer("part"),
    parts: integer("parts"),
    status: planItemStatusEnum("status").notNull().default("todo"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    actualMinutes: integer("actual_minutes"),
  },
  (t) => [index("plan_items_plan_date_idx").on(t.planId, t.date)],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planItemId: uuid("plan_item_id").references(() => planItems.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    minutes: integer("minutes").notNull(),
    source: text("source").notNull().default("manual"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("study_sessions_student_date_idx").on(t.studentId, t.date)],
);

// ---------------------------------------------------------- learning state
export const losProgress = pgTable(
  "los_progress",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    losId: uuid("los_id")
      .notNull()
      .references(() => los.id, { onDelete: "cascade" }),
    alpha: doublePrecision("alpha").notNull().default(1),
    beta: doublePrecision("beta").notNull().default(1),
    lastAt: timestamp("last_at", { withTimezone: true }),
    activeDays: integer("active_days").notNull().default(0),
    lastDay: date("last_day", { mode: "string" }),
    attempts: integer("attempts").notNull().default(0),
    everProficient: boolean("ever_proficient").notNull().default(false),
    studied: boolean("studied").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.losId] })],
);

export const attempts = pgTable(
  "attempts",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    losId: uuid("los_id")
      .notNull()
      .references(() => los.id),
    chosenKey: text("chosen_key").notNull(),
    correct: boolean("correct").notNull(),
    timeMs: integer("time_ms"),
    mode: attemptModeEnum("mode").notNull().default("practice"),
    assignmentId: uuid("assignment_id"),
    createdAt: createdAt(),
  },
  (t) => [index("attempts_student_created_idx").on(t.studentId, t.createdAt), index("attempts_question_idx").on(t.questionId)],
);

// ---------------------------------------------------------------- homework
export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: assignmentStatusEnum("status").notNull().default("draft"),
    /** class = every enrolled student; students = explicit list. */
    target: jsonb("target").$type<{ kind: "class" } | { kind: "students"; studentIds: string[] }>().notNull(),
    policies: jsonb("policies")
      .$type<{ showAnswers: "never" | "after_due" | "immediately"; allowLate: boolean }>()
      .notNull(),
    createdAt: createdAt(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
  },
  (t) => [index("assignments_class_idx").on(t.classId, t.dueAt)],
);

export const assignmentItems = pgTable(
  "assignment_items",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull().default("mcq"),
    questionId: uuid("question_id").references(() => questions.id),
    /** Prompt for text items (kind = 'text'). */
    prompt: text("prompt"),
    points: integer("points").notNull().default(1),
  },
  (t) => [index("assignment_items_assignment_idx").on(t.assignmentId, t.position)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: submissionStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    late: boolean("late").notNull().default(false),
    score: real("score"),
    maxScore: real("max_score"),
    teacherFeedback: text("teacher_feedback"),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("submissions_assignment_student_uq").on(t.assignmentId, t.studentId)],
);

export const submissionAnswers = pgTable(
  "submission_answers",
  {
    id: id(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => assignmentItems.id, { onDelete: "cascade" }),
    chosenKey: text("chosen_key"),
    textAnswer: text("text_answer"),
    correct: boolean("correct"),
    pointsAwarded: real("points_awarded"),
    feedback: text("feedback"),
  },
  (t) => [uniqueIndex("submission_answers_uq").on(t.submissionId, t.itemId)],
);

// -------------------------------------------------------------- governance
export const auditLog = pgTable("audit_log", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});
