"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "ascent-theme";

function current(): "light" | "dark" {
  // Dark is the default; only an explicit "light" switches it.
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const subscribe = (cb: () => void) => {
  window.addEventListener("ascent-theme", cb);
  return () => window.removeEventListener("ascent-theme", cb);
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as const);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {}
        window.dispatchEvent(new Event("ascent-theme"));
      }}
      className="inline-flex size-10 items-center justify-center rounded-[10px] border border-border-strong bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink max-sm:size-11"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

/** Inline, render-blocking script: apply a saved theme before first paint. */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
