"use server";

// Admin write actions: accounts and the question-bank CSV import. Authorization lives in services/admin.ts.

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { QUESTION_CSV } from "@/domain/question-csv";
import { runAction, type ActionResult } from "@/server/action";
import { adminContext } from "@/server/context";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  createAccount,
  importQuestions,
  previewQuestionImport,
  resetUserPassword,
  setUserDisabled,
  type ImportPreview,
  type ImportResult,
} from "@/services/admin";

const refresh = () => revalidatePath("/admin", "layout");
const bad = (e: z.ZodError): ActionResult<never> => ({
  ok: false,
  error: e.issues[0]?.message ?? "Check the form and try again.",
});

const password = z
  .string({ error: "Enter a password." })
  .min(MIN_PASSWORD_LENGTH, {
    error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  .max(MAX_PASSWORD_LENGTH, {
    error: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  });

const CreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Enter a name of at least 2 characters." })
    .max(80, { error: "Keep the name under 80 characters." }),
  email: z
    .string()
    .trim()
    .max(254, { error: "That email is too long." })
    .pipe(z.email({ error: "Enter a valid email address." })),
  role: z.enum(["student", "teacher", "admin"], { error: "Pick a role." }),
  password,
});

export async function createAccountAction(
  input: z.input<typeof CreateSchema>,
): Promise<ActionResult<{ email: string; role: string }>> {
  const { actor, db } = await adminContext();
  const p = CreateSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => {
    const u = await createAccount(db, actor, p.data);
    return { email: u.email, role: u.role };
  });
  if (r.ok) refresh();
  return r;
}

export async function setUserDisabledAction(
  userId: string,
  disabled: boolean,
): Promise<ActionResult<{ name: string; disabled: boolean }>> {
  const { actor, db } = await adminContext();
  const p = z
    .object({
      userId: z.uuid({ error: "That account no longer exists." }),
      disabled: z.boolean(),
    })
    .safeParse({ userId, disabled });
  if (!p.success) return bad(p.error);
  const r = await runAction(() =>
    setUserDisabled(db, actor, p.data.userId, p.data.disabled),
  );
  if (r.ok) refresh();
  return r;
}

export async function resetPasswordAction(
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ name: string; email: string }>> {
  const { actor, db } = await adminContext();
  const p = z
    .object({
      userId: z.uuid({ error: "That account no longer exists." }),
      password,
    })
    .safeParse({ userId, password: newPassword });
  if (!p.success) return bad(p.error);
  const r = await runAction(() =>
    resetUserPassword(db, actor, p.data.userId, p.data.password),
  );
  if (r.ok) refresh();
  return r;
}

// ------------------------------------------------------------- question CSV

// The file is read in the browser and sent as text, so this stays far below the 4.5 MB action body limit.
const CsvSchema = z.object({
  csv: z
    .string({ error: "Choose a CSV file first." })
    .min(1, { error: "The file is empty." })
    .max(QUESTION_CSV.maxBytes * 2, { error: "That file is too large." }),
});

export async function previewQuestionImportAction(input: {
  csv: string;
}): Promise<ActionResult<ImportPreview>> {
  const { actor, db } = await adminContext();
  const p = CsvSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  return runAction(() => previewQuestionImport(db, actor, p.data.csv));
}

export async function importQuestionsAction(input: {
  csv: string;
  skipInvalid: boolean;
}): Promise<ActionResult<ImportResult>> {
  const { actor, db } = await adminContext();
  const p = CsvSchema.extend({ skipInvalid: z.boolean() }).safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(() =>
    importQuestions(db, actor, p.data.csv, { skipInvalid: p.data.skipInvalid }),
  );
  if (r.ok) refresh();
  return r;
}
