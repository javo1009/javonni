"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { adminContext } from "@/server/context";
import { activateVersion, createTeacher, importCurriculum, previewImport, setUserDisabled, type ImportPreview } from "@/services/admin";

// Every action re-checks the session (adminContext) and the service re-checks the role.

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
/** The active curriculum shows up in every area (banners, plans), so refresh everything. */
const refreshAll = () => revalidatePath("/", "layout");

// -------------------------------------------------------------- curriculum

export type PreviewState = { ok: true; preview: ImportPreview } | { ok: false; error: string } | undefined;

export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const { actor, db } = await adminContext();
  const csv = str(formData.get("csv"), 2_000_000);
  if (!csv.trim()) return { ok: false, error: "Paste the CSV or choose a file first." };
  const r = await runAction(() => previewImport(db, actor, csv));
  return r.ok ? { ok: true, preview: r.data } : r;
}

export type ImportState =
  | { ok: true; message: string; versionId: string; activated: boolean }
  | { ok: false; error: string }
  | undefined;

export async function importCurriculumAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { actor, db } = await adminContext();
  const csv = str(formData.get("csv"), 2_000_000);
  const year = Number.parseInt(str(formData.get("year"), 10), 10);
  const r = await runAction(() =>
    importCurriculum(db, actor, csv, {
      name: str(formData.get("name"), 200),
      year: Number.isFinite(year) ? year : NaN,
      sourceNote: str(formData.get("sourceNote"), 2000),
      activate: formData.get("activate") === "on",
    }),
  );
  if (!r.ok) return r;
  refreshAll();
  const { stats, activated, versionId } = r.data;
  return {
    ok: true,
    versionId,
    activated,
    message: `Imported ${stats.los} objectives in ${stats.modules} modules across ${stats.topics} topics.${
      activated ? " It is now the active version: new study plans use it." : " It is not active yet."
    }`,
  };
}

export type SimpleState = { ok: true; message: string } | { ok: false; error: string } | undefined;

export async function activateVersionAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const { actor, db } = await adminContext();
  const r = await runAction(() => activateVersion(db, actor, str(formData.get("versionId"), 64)));
  if (!r.ok) return r;
  refreshAll();
  return { ok: true, message: r.data.changed ? `"${r.data.name}" is now active.` : `"${r.data.name}" was already active.` };
}

// ------------------------------------------------------------------- users

export type CreateStaffState =
  | { ok: true; message: string; email: string; generatedPassword: string | null }
  | { ok: false; error: string; values: { email: string; name: string; role: string } }
  | undefined;

export async function createStaffAction(_prev: CreateStaffState, formData: FormData): Promise<CreateStaffState> {
  const { actor, db, user } = await adminContext();
  const values = { email: str(formData.get("email")), name: str(formData.get("name")), role: str(formData.get("role"), 10) };
  const role = values.role === "admin" ? "admin" : "teacher";
  const r = await runAction(() =>
    createTeacher(db, actor, { email: values.email, name: values.name, role, password: str(formData.get("password")), timezone: user.timezone }),
  );
  if (!r.ok) return { ok: false, error: r.error, values };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    email: r.data.user.email,
    generatedPassword: r.data.generatedPassword,
    message: `Created ${role} account for ${r.data.user.name}.`,
  };
}

export async function setUserDisabledAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const { actor, db } = await adminContext();
  const disabled = formData.get("disabled") === "true";
  const r = await runAction(() => setUserDisabled(db, actor, str(formData.get("userId"), 64), disabled));
  if (!r.ok) return r;
  revalidatePath("/admin", "layout");
  return { ok: true, message: `${r.data.name} is ${disabled ? "disabled and signed out" : "enabled again"}.` };
}
