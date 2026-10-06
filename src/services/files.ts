// Homework files: the teacher's handout, the student's completed work, and returned feedback.
// Stored in Postgres (see db/schema.ts `files`). Listings never load file bytes.

import { and, asc, eq, sql } from "drizzle-orm";
import { assignmentItems, files, submissions } from "@/db/schema";
import { assertStudentAssignment, assertTeacherAssignment } from "./access";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db } from "./types";

export const FILE_LIMITS = {
  /** Under Vercel's 4.5 MB request limit, leaving room for the multipart envelope. */
  maxBytes: 4 * 1024 * 1024,
  perItem: 5,
  perAssignment: 5,
  feedbackPerSubmission: 3,
  /** Total stored per uploader, so one account can't fill the database. */
  perUserBytes: 100 * 1024 * 1024,
};

const ascii = (b: Buffer, from: number, s: string) => b.subarray(from, from + s.length).toString("latin1") === s;
const OLE = (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const ZIP = (b: Buffer) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) ;
const TEXT = (b: Buffer) => !b.subarray(0, 8192).includes(0);

/** Allowed types. The content-type we store and serve comes from here, never from the client. */
export const FILE_TYPES: Record<string, { mime: string; label: string; sniff: (b: Buffer) => boolean }> = {
  pdf: { mime: "application/pdf", label: "PDF", sniff: (b) => ascii(b, 0, "%PDF-") },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word", sniff: ZIP },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel", sniff: ZIP },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint", sniff: ZIP },
  doc: { mime: "application/msword", label: "Word", sniff: OLE },
  xls: { mime: "application/vnd.ms-excel", label: "Excel", sniff: OLE },
  ppt: { mime: "application/vnd.ms-powerpoint", label: "PowerPoint", sniff: OLE },
  csv: { mime: "text/csv; charset=utf-8", label: "CSV", sniff: TEXT },
  txt: { mime: "text/plain; charset=utf-8", label: "Text", sniff: TEXT },
  png: { mime: "image/png", label: "Image", sniff: (b) => b.length > 8 && b[0] === 0x89 && ascii(b, 1, "PNG") },
  jpg: { mime: "image/jpeg", label: "Image", sniff: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", label: "Image", sniff: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};

export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPES);
/** For an <input accept="…"> hint. */
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export type UploadInput = { name: string; bytes: Buffer };

/** A safe display name: no path, no control or shell-ish characters, bounded length. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

export function validateUpload(input: UploadInput): { name: string; contentType: string } {
  const name = sanitizeFileName(input.name);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const type = FILE_TYPES[ext];
  if (!name || !type) throw new ValidationError(`That file type isn't allowed. Use ${ALLOWED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.`);
  if (input.bytes.length === 0) throw new ValidationError("That file is empty.");
  if (input.bytes.length > FILE_LIMITS.maxBytes) throw new ValidationError(`Files can be at most ${FILE_LIMITS.maxBytes / 1024 / 1024} MB.`);
  if (!type.sniff(input.bytes)) throw new ValidationError(`That doesn't look like a real .${ext} file.`);
  return { name, contentType: type.mime };
}

export type FileMeta = {
  id: string;
  kind: "assignment" | "submission" | "feedback";
  name: string;
  size: number;
  contentType: string;
  itemId: string | null;
  createdAt: Date;
};

const meta = {
  id: files.id,
  kind: files.kind,
  name: files.name,
  size: files.size,
  contentType: files.contentType,
  itemId: files.itemId,
  createdAt: files.createdAt,
};

async function assertQuota(db: Db, uploaderId: string, adding: number) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${files.size}), 0)::bigint` }).from(files).where(eq(files.uploaderId, uploaderId));
  if (Number(r.n) + adding > FILE_LIMITS.perUserBytes) throw new ValidationError("You've reached your upload limit. Delete some files first.");
}

const count = async (db: Db, where: ReturnType<typeof and>) => {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(files).where(where);
  return r.n;
};

// ------------------------------------------------------------------ teacher
/** Attach a handout to an assignment (draft or assigned). */
export async function attachAssignmentFile(db: Db, actor: Actor, assignmentId: string, input: UploadInput): Promise<FileMeta> {
  const a = await assertTeacherAssignment(db, actor, assignmentId);
  const { name, contentType } = validateUpload(input);
  if ((await count(db, and(eq(files.assignmentId, a.id), eq(files.kind, "assignment")))) >= FILE_LIMITS.perAssignment)
    throw new ValidationError(`An assignment can have at most ${FILE_LIMITS.perAssignment} files.`);
  await assertQuota(db, actor.id, input.bytes.length);
  const [row] = await db
    .insert(files)
    .values({ kind: "assignment", uploaderId: actor.id, assignmentId: a.id, name, contentType, size: input.bytes.length, data: input.bytes })
    .returning(meta);
  return row;
}

/** Handouts can only be removed while the assignment is a draft: students may already be working from them. */
export async function removeAssignmentFile(db: Db, actor: Actor, fileId: string) {
  const [f] = await db.select({ id: files.id, kind: files.kind, assignmentId: files.assignmentId }).from(files).where(eq(files.id, fileId)).limit(1);
  if (!f || f.kind !== "assignment") throw new NotFoundError("File not found.");
  const a = await assertTeacherAssignment(db, actor, f.assignmentId);
  if (a.status !== "draft") throw new ValidationError("Students can already see this file. Only drafts can have files removed.");
  await db.delete(files).where(eq(files.id, fileId));
}

/** Return marked-up work to a student. The submission must have been handed in. */
export async function attachFeedbackFile(db: Db, actor: Actor, submissionId: string, input: UploadInput): Promise<FileMeta> {
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!sub) throw new NotFoundError("Submission not found.");
  await assertTeacherAssignment(db, actor, sub.assignmentId);
  if (sub.status === "in_progress") throw new ValidationError("The student hasn't handed this in yet.");
  const { name, contentType } = validateUpload(input);
  if ((await count(db, and(eq(files.submissionId, sub.id), eq(files.kind, "feedback")))) >= FILE_LIMITS.feedbackPerSubmission)
    throw new ValidationError(`At most ${FILE_LIMITS.feedbackPerSubmission} feedback files per submission.`);
  await assertQuota(db, actor.id, input.bytes.length);
  const [row] = await db
    .insert(files)
    .values({
      kind: "feedback",
      uploaderId: actor.id,
      assignmentId: sub.assignmentId,
      submissionId: sub.id,
      name,
      contentType,
      size: input.bytes.length,
      data: input.bytes,
    })
    .returning(meta);
  return row;
}

export async function removeFeedbackFile(db: Db, actor: Actor, fileId: string) {
  const [f] = await db.select({ kind: files.kind, assignmentId: files.assignmentId }).from(files).where(eq(files.id, fileId)).limit(1);
  if (!f || f.kind !== "feedback") throw new NotFoundError("File not found.");
  await assertTeacherAssignment(db, actor, f.assignmentId);
  await db.delete(files).where(eq(files.id, fileId));
}

// ------------------------------------------------------------------ student
async function ensureSubmission(db: Db, studentId: string, assignmentId: string) {
  const find = async () =>
    (await db.select().from(submissions).where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, studentId))).limit(1))[0];
  return (await find()) ?? (await db.insert(submissions).values({ assignmentId, studentId }).onConflictDoNothing().returning())[0] ?? (await find());
}

/** Attach completed work to a file item. Allowed until the homework is handed in. */
export async function attachSubmissionFile(
  db: Db,
  actor: Actor,
  input: { assignmentId: string; itemId: string; file: UploadInput },
  now = new Date(),
): Promise<FileMeta> {
  const a = await assertStudentAssignment(db, actor, input.assignmentId);
  const [item] = await db
    .select({ id: assignmentItems.id, kind: assignmentItems.kind })
    .from(assignmentItems)
    .where(and(eq(assignmentItems.id, input.itemId), eq(assignmentItems.assignmentId, a.id)))
    .limit(1);
  if (!item || item.kind !== "file") throw new ValidationError("That part of the homework doesn't take a file.");
  if (a.dueAt < now && !a.policies.allowLate) throw new ValidationError("The due date has passed and late work isn't accepted.");
  const { name, contentType } = validateUpload(input.file);
  const sub = await ensureSubmission(db, actor.id, a.id);
  if (sub.status !== "in_progress") throw new ValidationError("This homework has already been handed in.");
  if ((await count(db, and(eq(files.submissionId, sub.id), eq(files.itemId, item.id), eq(files.kind, "submission")))) >= FILE_LIMITS.perItem)
    throw new ValidationError(`You can upload at most ${FILE_LIMITS.perItem} files here.`);
  await assertQuota(db, actor.id, input.file.bytes.length);
  const [row] = await db
    .insert(files)
    .values({
      kind: "submission",
      uploaderId: actor.id,
      assignmentId: a.id,
      submissionId: sub.id,
      itemId: item.id,
      name,
      contentType,
      size: input.file.bytes.length,
      data: input.file.bytes,
    })
    .returning(meta);
  return row;
}

export async function removeSubmissionFile(db: Db, actor: Actor, fileId: string) {
  if (actor.role !== "student") throw new ForbiddenError();
  const [f] = await db
    .select({ id: files.id, kind: files.kind, submissionId: files.submissionId })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!f || f.kind !== "submission" || !f.submissionId) throw new NotFoundError("File not found.");
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, f.submissionId)).limit(1);
  if (!sub || sub.studentId !== actor.id) throw new NotFoundError("File not found.");
  if (sub.status !== "in_progress") throw new ValidationError("This homework has already been handed in.");
  await db.delete(files).where(eq(files.id, fileId));
}

// ------------------------------------------------------------------ listing
/** Metadata only. Callers must already have authorized access to these ids. */
export async function listAssignmentFiles(db: Db, assignmentId: string): Promise<FileMeta[]> {
  return db.select(meta).from(files).where(and(eq(files.assignmentId, assignmentId), eq(files.kind, "assignment"))).orderBy(asc(files.createdAt));
}

export async function listSubmissionFiles(db: Db, submissionId: string, kinds: ("submission" | "feedback")[] = ["submission", "feedback"]): Promise<FileMeta[]> {
  const rows = await db.select(meta).from(files).where(eq(files.submissionId, submissionId)).orderBy(asc(files.createdAt));
  return rows.filter((r) => (kinds as string[]).includes(r.kind));
}

// ----------------------------------------------------------------- download
export type DownloadableFile = { id: string; name: string; contentType: string; size: number; bytes: Buffer };

/**
 * The file's bytes, if the actor may open it:
 *  - handout: the class's teacher/admin, or a student the assignment applies to (once assigned)
 *  - student work: its owner, or the class's teacher/admin
 *  - feedback: the class's teacher/admin, or the submission's student once it is graded
 * Anything else is "not found", so file ids don't reveal what exists.
 */
export async function getFileForDownload(db: Db, actor: Actor, fileId: string): Promise<DownloadableFile> {
  const [f] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!f) throw new NotFoundError("File not found.");
  try {
    if (actor.role === "student") {
      if (f.kind === "assignment") await assertStudentAssignment(db, actor, f.assignmentId);
      else {
        const [sub] = f.submissionId ? await db.select().from(submissions).where(eq(submissions.id, f.submissionId)).limit(1) : [];
        if (!sub || sub.studentId !== actor.id) throw new NotFoundError();
        if (f.kind === "feedback" && sub.status !== "graded") throw new NotFoundError();
      }
    } else {
      await assertTeacherAssignment(db, actor, f.assignmentId);
    }
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) throw new NotFoundError("File not found.");
    throw e;
  }
  return { id: f.id, name: f.name, contentType: f.contentType, size: f.size, bytes: f.data };
}
