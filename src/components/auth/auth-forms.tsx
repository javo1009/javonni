"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { login, register, type AuthFormState } from "@/app/actions/auth";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <Field label="Email" htmlFor="email" errors={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="password" errors={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-ink-2">
        New student?{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Join your class
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(register, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    // Read the browser's timezone after mount so "today" matches the student's calendar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  const fe = state?.fieldErrors;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <input type="hidden" name="timezone" value={tz} />
      <Field label="Class code" htmlFor="joinCode" hint="Your teacher gives you this 6-character code." errors={fe?.joinCode}>
        <Input id="joinCode" name="joinCode" defaultValue={state?.values?.joinCode ?? defaultCode} autoCapitalize="characters" className="uppercase tracking-[0.2em]" required />
      </Field>
      <Field label="Your name" htmlFor="name" errors={fe?.name}>
        <Input id="name" name="name" autoComplete="name" required defaultValue={state?.values?.name} />
      </Field>
      <Field label="Email" htmlFor="email" errors={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters. A short phrase works well." errors={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
