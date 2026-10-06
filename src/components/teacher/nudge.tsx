"use client";

import { Mail } from "lucide-react";
import { useId, useState } from "react";
import { Input, Textarea, buttonClass } from "@/components/ui";
import { CopyButton } from "./copy-button";

/**
 * One-click nudge with an editable template. There is no in-app messaging yet,
 * so it opens the teacher's email client via mailto: with the edited text.
 */
export function Nudge({ name, email, subject, template }: { name: string; email: string; subject: string; template: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [subj, setSubj] = useState(subject);
  const [body, setBody] = useState(template);
  const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="w-full">
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <Mail aria-hidden className="size-4" />
        Nudge<span className="sr-only"> {name}</span>
      </button>
      {open && (
        <div id={`${id}-panel`} className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-subj`} className="block text-sm font-medium text-ink">
              Subject
            </label>
            <Input id={`${id}-subj`} value={subj} onChange={(e) => setSubj(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-body`} className="block text-sm font-medium text-ink">
              Message to {name}
            </label>
            <Textarea id={`${id}-body`} rows={7} value={body} onChange={(e) => setBody(e.target.value)} className="text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={href} className={buttonClass("primary", "sm")}>
              Open in email
            </a>
            <CopyButton value={body} label={`Copy message to ${name}`} />
            <span className="text-xs text-ink-2">Sends from your own email app to {email}.</span>
          </div>
        </div>
      )}
    </div>
  );
}
