"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";

/** Switches the ?class= param of the current page. */
export function ClassSwitcher({ classes, current }: { classes: { id: string; name: string; students: number }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  if (classes.length < 2) return null;
  return (
    <div className="space-y-1">
      <label htmlFor="class-switch" className="block text-xs font-medium uppercase tracking-[0.08em] text-ink-2">
        Class
      </label>
      <Select
        id="class-switch"
        defaultValue={current}
        aria-busy={pending}
        className="w-64! max-w-full"
        onChange={(e) => {
          const id = e.target.value;
          start(() => router.push(`${pathname}?class=${encodeURIComponent(id)}`));
        }}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.students})
          </option>
        ))}
      </Select>
    </div>
  );
}
