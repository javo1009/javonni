// Client-safe mirror of the upload rules in src/services/files.ts (that module is server code).
// The server re-checks everything; this only gives teachers instant feedback before a round trip.

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_HANDOUTS = 5;
export const MAX_FEEDBACK_FILES = 3;
export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "doc",
  "xls",
  "ppt",
  "csv",
  "txt",
  "png",
  "jpg",
  "jpeg",
] as const;
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");
export const ALLOWED_LABEL =
  "PDF, Word, Excel, PowerPoint, CSV, text, PNG or JPG";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** A message when the file can't be uploaded, otherwise null. */
export function fileProblem(file: {
  name: string;
  size: number;
}): string | null {
  if (
    !(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))
  )
    return `Not an allowed type. Use ${ALLOWED_LABEL}.`;
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES)
    return `Too large (${formatBytes(file.size)}). The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const isImageName = (name: string) =>
  ["png", "jpg", "jpeg"].includes(extensionOf(name));

export const downloadUrl = (fileId: string) => `/api/files/${fileId}`;
