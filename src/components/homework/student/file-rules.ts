// Client-safe copy of the upload rules in src/services/files.ts (that module is server code: it needs Buffer
// and the database). Keep these in sync with FILE_LIMITS / FILE_TYPES there; __tests__/file-rules.test.ts checks it.
// The server re-validates everything (including magic bytes), so these checks only save a round trip.

export const FILE_RULES = {
  /** FILE_LIMITS.maxBytes */
  maxBytes: 4 * 1024 * 1024,
  /** FILE_LIMITS.perItem */
  perItem: 5,
};

/** Object.keys(FILE_TYPES) with a display label each. */
export const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
  doc: "Word",
  xls: "Excel",
  ppt: "PowerPoint",
  csv: "CSV",
  txt: "Text",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
};

export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPE_LABELS);
/** For an <input accept="…"> hint (same as ACCEPT_ATTR in services/files.ts). */
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type FileIconKind = "pdf" | "doc" | "sheet" | "slides" | "image" | "text" | "other";

export function iconKindOf(name: string): FileIconKind {
  switch (extensionOf(name)) {
    case "pdf":
      return "pdf";
    case "doc":
    case "docx":
      return "doc";
    case "xls":
    case "xlsx":
    case "csv":
      return "sheet";
    case "ppt":
    case "pptx":
      return "slides";
    case "png":
    case "jpg":
    case "jpeg":
      return "image";
    case "txt":
      return "text";
    default:
      return "other";
  }
}

export function typeLabelOf(name: string): string {
  return FILE_TYPE_LABELS[extensionOf(name)] ?? "File";
}

/** 1536 -> "1.5 KB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round((n / 1024) * 10) / 10} KB`.replace(".0 KB", " KB");
  return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`.replace(".0 MB", " MB");
}

export const ALLOWED_TYPES_TEXT = "PDF, Word, Excel, PowerPoint, CSV, text or image";
export const maxSizeText = () => `${FILE_RULES.maxBytes / 1024 / 1024} MB`;

/** A message if the file can't be uploaded, else null. `already` = files this item already holds (incl. queued). */
export function validateClientFile(file: { name: string; size: number }, already = 0): string | null {
  const ext = extensionOf(file.name);
  if (!file.name || !FILE_TYPE_LABELS[ext]) return `“${file.name || "That file"}” isn't an allowed type. Use ${ALLOWED_TYPES_TEXT} files.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > FILE_RULES.maxBytes) return `“${file.name}” is ${formatBytes(file.size)}. Files can be at most ${maxSizeText()}.`;
  if (already >= FILE_RULES.perItem) return `You can upload at most ${FILE_RULES.perItem} files here. Remove one to add “${file.name}”.`;
  return null;
}
