"use client";

import { Eye, EyeOff, Wand2 } from "lucide-react";
import { useState } from "react";
import { Field, Input, buttonClass } from "@/components/ui";

export const MIN_PASSWORD = 12;

// No look-alike characters (0/O, 1/l/I), so a password read aloud or typed from paper survives.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 random characters in four dash-separated groups, e.g. "Kp7m-Xq3w-Tz9c-Hn4v". */
export function generatePassword(): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length); // reject the biased tail
  while (out.length < 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    for (const b of bytes) {
      if (b < limit && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("").replace(/(.{4})(?=.)/g, "$1-");
}

/** Temporary-password input: show/hide, a generator, and a live length check (words, not colour alone). */
export function PasswordField({
  id,
  label = "Temporary password",
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const ok = value.length >= MIN_PASSWORD;
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        <span id={`${id}-count`}>
          {value.length === 0
            ? `At least ${MIN_PASSWORD} characters. Generate one, or type your own.`
            : ok
              ? `${value.length} characters. Long enough.`
              : `${value.length} of ${MIN_PASSWORD} characters. Needs ${MIN_PASSWORD - value.length} more.`}
        </span>
      }
    >
      <div className="flex gap-2">
        <Input
          id={id}
          name="password"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          autoFocus={autoFocus}
          aria-describedby={`${id}-count`}
          className="min-w-0 flex-1 font-mono"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className={buttonClass("secondary", "md", "size-11 shrink-0 px-0")}
        >
          {shown ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setShown(true);
          }}
          aria-label="Generate a password"
          className={buttonClass(
            "secondary",
            "md",
            "h-11 shrink-0 max-sm:size-11 max-sm:px-0",
          )}
        >
          <Wand2 aria-hidden className="size-4" />
          <span className="max-sm:hidden">Generate</span>
        </button>
      </div>
    </Field>
  );
}
