"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { buttonClass } from "@/components/ui";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure origins or denied permissions.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copies `text` and confirms in place (and to screen readers). `text` may be a function for values only known in the browser. */
export function CopyButton({
  text,
  children = "Copy",
  variant = "secondary",
  size = "sm",
  className,
  ...props
}: {
  text: string | (() => string);
  children?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
} & Omit<ComponentProps<"button">, "onClick" | "children">) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const ok = await writeClipboard(typeof text === "function" ? text() : text);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={buttonClass(variant, size, className)}
        {...props}
      >
        {state === "copied"
          ? "Copied ✓"
          : state === "failed"
            ? "Copy failed"
            : children}
      </button>
      <span role="status" className="sr-only">
        {state === "copied"
          ? "Copied to clipboard"
          : state === "failed"
            ? "Could not copy. Select the text and copy it manually."
            : ""}
      </span>
    </>
  );
}
