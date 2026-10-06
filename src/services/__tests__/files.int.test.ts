import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { enrollments, files } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { seedBase } from "@/test/seed";
import { createClass } from "../classes";
import {
  attachAssignmentFile,
  attachFeedbackFile,
  attachSubmissionFile,
  FILE_LIMITS,
  getFileForDownload,
  removeAssignmentFile,
  removeFeedbackFile,
  removeSubmissionFile,
  sanitizeFileName,
  validateUpload,
} from "../files";
import {
  createAssignment,
  getAssignmentForStudent,
  getAssignmentForTeacher,
  getSubmissionForTeacher,
  gradeSubmission,
  publishAssignment,
  submitAssignment,
} from "../homework";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let teacher: Actor;
let otherTeacher: Actor;
let admin: Actor;
let s1: Actor;
let s2: Actor;
let outsider: Actor;
let classId: string;

const NOW = new Date("2026-11-10T09:00:00Z");
const DUE = new Date("2026-11-12T21:00:00Z");
const policies = { showAnswers: "after_due" as const, allowLate: false };

const pdf = (extra = "") => ({ name: "sheet.pdf", bytes: Buffer.from(`%PDF-1.4\n${extra}\n%%EOF`) });
const docx = (name = "work.docx") => ({ name, bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from("word/document.xml")]) });

async function actor(email: string, role: "student" | "teacher" | "admin") {
  const u = await createUser(t.db, { email, name: email.split("@")[0], role, password: "a-long-password-1" });
  return { id: u.id, role } as Actor;
}

async function makeHomework(assign = true) {
  const a = await createAssignment(
    t.db,
    teacher,
    {
      classId,
      title: "Ethics case write-up",
      dueAt: DUE,
      target: { kind: "class" },
      policies,
      items: [{ kind: "file", prompt: "Upload your completed worksheet" }],
      assign,
    },
    NOW,
  );
  const detail = await getAssignmentForTeacher(t.db, teacher, a.id);
  return { a, itemId: detail.items[0].item.id };
}

beforeAll(async () => {
  t = await createTestDb();
  await seedBase(t.db);
  teacher = await actor("teach@x.test", "teacher");
  otherTeacher = await actor("other@x.test", "teacher");
  admin = await actor("admin@x.test", "admin");
  s1 = await actor("s1@x.test", "student");
  s2 = await actor("s2@x.test", "student");
  outsider = await actor("out@x.test", "student");
  classId = (await createClass(t.db, teacher, { name: "Evening A" }, "2026-11-01")).id;
  const otherClass = (await createClass(t.db, otherTeacher, { name: "Other" }, "2026-11-01")).id;
  await t.db.insert(enrollments).values([
    { classId, studentId: s1.id },
    { classId, studentId: s2.id },
    { classId: otherClass, studentId: outsider.id },
  ]);
});
afterAll(() => t.drop());

describe("upload validation", () => {
  it("sanitizes names", () => {
    expect(sanitizeFileName("../../etc/pass\"wd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\Users\\me\\hw 1.docx")).toBe("hw 1.docx");
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`)).toHaveLength(120);
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`).endsWith(".pdf")).toBe(true);
  });

  it("accepts real files and serves our own content type", () => {
    expect(validateUpload(pdf())).toEqual({ name: "sheet.pdf", contentType: "application/pdf" });
    expect(validateUpload(docx()).contentType).toContain("wordprocessingml");
    expect(validateUpload({ name: "notes.TXT", bytes: Buffer.from("hello") }).contentType).toContain("text/plain");
  });

  it("rejects wrong types, mismatched content, empty and oversized files", () => {
    expect(() => validateUpload({ name: "run.exe", bytes: Buffer.from("MZ") })).toThrow(ValidationError);
    expect(() => validateUpload({ name: "page.html", bytes: Buffer.from("<script>") })).toThrow(ValidationError);
    expect(() => validateUpload({ name: "noext", bytes: Buffer.from("x") })).toThrow(ValidationError);
    expect(() => validateUpload({ name: "fake.pdf", bytes: Buffer.from("<html>") })).toThrow(/real \.pdf/);
    expect(() => validateUpload({ name: "fake.png", bytes: Buffer.from("%PDF-1.4") })).toThrow(ValidationError);
    expect(() => validateUpload({ name: "data.txt", bytes: Buffer.from([65, 0, 66]) })).toThrow(ValidationError);
    expect(() => validateUpload({ name: "empty.pdf", bytes: Buffer.alloc(0) })).toThrow(/empty/);
    const big = Buffer.alloc(FILE_LIMITS.maxBytes + 1);
    big.write("%PDF-");
    expect(() => validateUpload({ name: "big.pdf", bytes: big })).toThrow(/at most/);
  });
});

describe("homework file flow", () => {
  it("runs handout → student upload → hand in → grade → feedback", async () => {
    const { a, itemId } = await makeHomework(false);

    // handout on a draft; only the owner (or an admin) may attach
    const handout = await attachAssignmentFile(t.db, teacher, a.id, pdf("handout"));
    await expect(attachAssignmentFile(t.db, otherTeacher, a.id, pdf())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attachAssignmentFile(t.db, s1, a.id, pdf())).rejects.toBeInstanceOf(ForbiddenError);
    const extra = await attachAssignmentFile(t.db, admin, a.id, pdf("extra"));
    await removeAssignmentFile(t.db, teacher, extra.id);

    // students can't open a draft's handout
    await expect(getFileForDownload(t.db, s1, handout.id)).rejects.toBeInstanceOf(NotFoundError);
    await publishAssignment(t.db, teacher, a.id, NOW);

    // once assigned: class students can, outsiders can't, and handouts are locked in
    const dl = await getFileForDownload(t.db, s1, handout.id);
    expect(dl.bytes.toString()).toContain("handout");
    expect(dl.contentType).toBe("application/pdf");
    await expect(getFileForDownload(t.db, outsider, handout.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFileForDownload(t.db, otherTeacher, handout.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeAssignmentFile(t.db, teacher, handout.id)).rejects.toBeInstanceOf(ValidationError);
    const studentView = await getAssignmentForStudent(t.db, s1, a.id, NOW);
    expect(studentView.attachments.map((f) => f.name)).toEqual(["sheet.pdf"]);

    // handing in without uploading is refused
    await expect(submitAssignment(t.db, s1, a.id, [], NOW)).rejects.toThrow(/Upload your work/);

    // student uploads; the type check applies to the item, not just the extension
    const up = await attachSubmissionFile(t.db, s1, { assignmentId: a.id, itemId, file: docx() }, NOW);
    await expect(attachSubmissionFile(t.db, s1, { assignmentId: a.id, itemId, file: { name: "x.pdf", bytes: Buffer.from("nope") } }, NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(attachSubmissionFile(t.db, outsider, { assignmentId: a.id, itemId, file: docx() }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(attachSubmissionFile(t.db, teacher, { assignmentId: a.id, itemId, file: docx() }, NOW)).rejects.toBeInstanceOf(ForbiddenError);

    // submission file visibility: owner + class teacher/admin only
    expect((await getFileForDownload(t.db, s1, up.id)).name).toBe("work.docx");
    expect((await getFileForDownload(t.db, teacher, up.id)).name).toBe("work.docx");
    expect((await getFileForDownload(t.db, admin, up.id)).name).toBe("work.docx");
    await expect(getFileForDownload(t.db, s2, up.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFileForDownload(t.db, outsider, up.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFileForDownload(t.db, otherTeacher, up.id)).rejects.toBeInstanceOf(NotFoundError);

    // a student can swap a file before handing in
    const second = await attachSubmissionFile(t.db, s1, { assignmentId: a.id, itemId, file: docx("v2.docx") }, NOW);
    await removeSubmissionFile(t.db, s1, second.id);
    await expect(removeSubmissionFile(t.db, s2, up.id)).rejects.toBeInstanceOf(NotFoundError);

    const submitted = await submitAssignment(t.db, s1, a.id, [], NOW);
    expect(submitted.status).toBe("submitted");
    await expect(attachSubmissionFile(t.db, s1, { assignmentId: a.id, itemId, file: docx("late.docx") }, NOW)).rejects.toThrow(/already been handed in/);
    await expect(removeSubmissionFile(t.db, s1, up.id)).rejects.toThrow(/already been handed in/);

    // teacher sees the upload, can't return it ungraded, then grades and attaches feedback
    const review = await getSubmissionForTeacher(t.db, teacher, submitted.id);
    expect(review.items[0].files.map((f) => f.name)).toEqual(["work.docx"]);
    await expect(gradeSubmission(t.db, teacher, submitted.id, { items: [] }, NOW)).rejects.toThrow(/Grade every/);
    const fb = await attachFeedbackFile(t.db, teacher, submitted.id, pdf("marked up"));
    await expect(getFileForDownload(t.db, s1, fb.id)).rejects.toBeInstanceOf(NotFoundError); // hidden until graded
    await gradeSubmission(t.db, teacher, submitted.id, { items: [{ itemId, points: 1 }], feedback: "Well done" }, NOW);
    expect((await getFileForDownload(t.db, s1, fb.id)).bytes.toString()).toContain("marked up");
    await expect(getFileForDownload(t.db, s2, fb.id)).rejects.toBeInstanceOf(NotFoundError);
    const graded = await getAssignmentForStudent(t.db, s1, a.id, NOW);
    expect(graded.submission?.feedbackFiles.map((f) => f.name)).toEqual(["sheet.pdf"]);
    await removeFeedbackFile(t.db, teacher, fb.id);
    await expect(removeFeedbackFile(t.db, otherTeacher, fb.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses uploads after the deadline when late work isn't allowed, and for non-file items", async () => {
    const { a, itemId } = await makeHomework();
    await expect(
      attachSubmissionFile(t.db, s2, { assignmentId: a.id, itemId, file: docx() }, new Date(DUE.getTime() + 1000)),
    ).rejects.toThrow(/due date has passed/);
    await expect(
      attachSubmissionFile(t.db, s2, { assignmentId: a.id, itemId: "00000000-0000-4000-8000-000000000000", file: docx() }, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces per-item and per-assignment counts and the per-user quota", async () => {
    const { a, itemId } = await makeHomework();
    for (let i = 0; i < FILE_LIMITS.perItem; i++) await attachSubmissionFile(t.db, s2, { assignmentId: a.id, itemId, file: docx(`w${i}.docx`) }, NOW);
    await expect(attachSubmissionFile(t.db, s2, { assignmentId: a.id, itemId, file: docx("one-more.docx") }, NOW)).rejects.toThrow(/at most/);

    const d = await makeHomework(false);
    for (let i = 0; i < FILE_LIMITS.perAssignment; i++) await attachAssignmentFile(t.db, teacher, d.a.id, pdf(String(i)));
    await expect(attachAssignmentFile(t.db, teacher, d.a.id, pdf("x"))).rejects.toThrow(/at most/);

    // quota: pretend s1 has stored almost the whole allowance
    await t.db.insert(files).values({
      kind: "submission",
      uploaderId: s1.id,
      assignmentId: a.id,
      name: "ballast.pdf",
      contentType: "application/pdf",
      size: FILE_LIMITS.perUserBytes - 10,
      data: Buffer.from("%PDF-"),
    });
    await expect(attachSubmissionFile(t.db, s1, { assignmentId: a.id, itemId, file: docx() }, NOW)).rejects.toThrow(/upload limit/);
    await t.db.delete(files).where(eq(files.name, "ballast.pdf"));
  });

  it("won't take feedback for work that hasn't been handed in", async () => {
    const { a, itemId } = await makeHomework();
    await attachSubmissionFile(t.db, s2, { assignmentId: a.id, itemId, file: docx() }, NOW);
    const [sub] = await t.db.query.submissions.findMany({ where: (s, { and, eq }) => and(eq(s.assignmentId, a.id), eq(s.studentId, s2.id)) });
    await expect(attachFeedbackFile(t.db, teacher, sub.id, pdf())).rejects.toThrow(/hasn't handed/);
  });
});
