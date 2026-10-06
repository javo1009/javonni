"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

/** Switches the `class` query param, keeping any other filters (tab etc.). */
export function ClassPicker({
  classes,
  value,
}: {
  classes: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  if (classes.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="class-picker" className="text-sm font-medium text-ink-2">
        Class
      </label>
      <Select
        id="class-picker"
        value={value}
        className="w-auto min-w-52 max-sm:w-full"
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set("class", e.target.value);
          router.push(`${path}?${next.toString()}`);
        }}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
