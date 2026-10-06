import {
  boolean,
  date,
  customType,
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
export const attemptModeEnum = pgEnum("attempt_mode", ["practice", "timed", "mock", "homework"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["draft", "assigned"]);
export const submissionStatusEnum = pgEnum("submission_status", ["in_progress", "submitted", "graded"]);
export const fileKindEnum = pgEnum("file_kind", ["assignment", "submission", "feedback"]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ---------------------------------------------------------------- identity
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** IANA zone used to decide what "today" means for this user. */
    timezone: text("timezone").notNull().default("UTC"),
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
    /** Roadmap start shared by the cohort; students joining later inherit it. */
    planStart: date("plan_start", { mode: "string" }),
    /** Default weekly study target for students in the class, in minutes. */
    weeklyTargetMinutes: integer("weekly_target_minutes").notNull().default(600),
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
    /** Weeks of the first pass this topic gets at the reference runway (scaled for others). */
    studyWeeks: integer("study_weeks").notNull().default(1),
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
    /** Position within the topic as printed in the curriculum (1-based). */
    number: integer("number").notNull().default(1),
    /** Stable id such as "quantitative-methods-04"; used to restore tracker backups. */
    slug: text("slug"),
    estMinutes: integer("est_minutes").notNull().default(180),
  },
  (t) => [index("modules_topic_idx").on(t.topicId), uniqueIndex("modules_topic_slug_uq").on(t.topicId, t.slug)],
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
  /** The learning module the question belongs to. */
  moduleId: uuid("module_id").references(() => modules.id, { onDelete: "set null" }),
  /** "sample" for bundled demo questions, "authored" for the academy's own. */
  source: text("source").notNull().default("authored"),
  authorId: uuid("author_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("questions_module_idx").on(t.moduleId)]);

// ---------------------------------------------------------------- tracker
/** One row per student: the settings the dashboard header edits. */
export const studentProfiles = pgTable("student_profiles", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  /** First day of the student's roadmap; expected hours accrue from here. */
  planStart: date("plan_start", { mode: "string" }).notNull(),
  weeklyTargetMinutes: integer("weekly_target_minutes").notNull().default(600),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chapter tracking: read, did questions, reviewed, plus a practice score. */
export const moduleProgress = pgTable(
  "module_progress",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    read: boolean("read").notNull().default(false),
    practice: boolean("practice").notNull().default(false),
    review: boolean("review").notNull().default(false),
    /** Practice score in percent, entered by the student; null until recorded. */
    accuracy: integer("accuracy"),
    /** Self-rated confidence: 1 shaky, 2 okay, 3 solid. */
    confidence: integer("confidence"),
    /** Student-local dates; null when unknown (e.g. restored from a backup). */
    readOn: date("read_on", { mode: "string" }),
    reviewedOn: date("reviewed_on", { mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.moduleId] })],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    minutes: integer("minutes").notNull(),
    /** A topic name, or "Mixed review" / "Mock exam". */
    topic: text("topic").notNull().default(""),
    /** "manual", "timer" or "backup". */
    source: text("source").notNull().default("manual"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("study_sessions_student_date_idx").on(t.studentId, t.date)],
);

export const mockResults = pgTable(
  "mock_results",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    score: real("score").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("mock_results_student_date_idx").on(t.studentId, t.date)],
);

/** Answers to questions in the bank (practice and homework). */
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
    moduleId: uuid("module_id").references(() => modules.id, { onDelete: "set null" }),
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

// ------------------------------------------------------------------- files
/**
 * Homework files, stored in Postgres so deployments need no extra storage service.
 * kind "assignment" = handed out by the teacher; "submission" = the student's completed
 * work for a file item; "feedback" = marked-up work the teacher returns.
 * Never select `data` in listings: only the download route reads it.
 */
export const files = pgTable(
  "files",
  {
    id: id(),
    kind: fileKindEnum("kind").notNull(),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
    /** The file item a submission file answers. */
    itemId: uuid("item_id").references(() => assignmentItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("files_assignment_kind_idx").on(t.assignmentId, t.kind), index("files_submission_idx").on(t.submissionId)],
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
