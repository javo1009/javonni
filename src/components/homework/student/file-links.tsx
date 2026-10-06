import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatBytes,
  iconKindOf,
  typeLabelOf,
  type FileIconKind,
} from "./file-rules";

const ICONS: Record<FileIconKind, typeof File> = {
  pdf: FileText,
  doc: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: ImageIcon,
  other: File,
};

export function FileTypeIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[iconKindOf(name)];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

export type FileLike = { id: string; name: string; size: number };

export const fileHref = (id: string) => `/api/files/${id}`;

/** Download links for files (handouts, the student's own uploads, feedback). Plain anchors: the route sends an attachment. */
export function FileLinks({
  files,
  label,
}: {
  files: FileLike[];
  label: string;
}) {
  return (
    <ul aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={fileHref(f.id)}
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 transition hover:border-border-strong hover:bg-surface-3 max-sm:min-h-14"
          >
            <FileTypeIcon name={f.name} />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate font-medium text-ink group-hover:underline"
                title={f.name}
              >
                {f.name}
              </span>
              <span className="block text-xs text-ink-2">
                {typeLabelOf(f.name)} · {formatBytes(f.size)}
              </span>
            </span>
            <Download aria-hidden className="size-4 shrink-0 text-ink-2" />
            <span className="sr-only">Download</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
