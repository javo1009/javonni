"use client";

import { useActionState } from "react";
import { createStaffAction, type CreateStaffState } from "@/app/actions/admin";
import { Banner, Field, FormError, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyText } from "./copy-text";

export function CreateStaffForm() {
  const [state, action] = useActionState<CreateStaffState, FormData>(createStaffAction, undefined);
  const values = state?.ok === false ? state.values : undefined;
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" aria-describedby="staff-help">
        <p id="staff-help" className="text-sm text-ink-2">
          Create teacher (or admin) accounts here. Students join themselves with a class code from their teacher.
        </p>
        {state?.ok === false && <FormError message={state.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="staff-name">
            <Input id="staff-name" name="name" autoComplete="off" required minLength={2} maxLength={80} defaultValue={values?.name} />
          </Field>
          <Field label="Email" htmlFor="staff-email">
            <Input id="staff-email" name="email" type="email" autoComplete="off" required defaultValue={values?.email} />
          </Field>
          <Field label="Role" htmlFor="staff-role">
            <Select id="staff-role" name="role" defaultValue={values?.role ?? "teacher"}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Initial password (optional)" htmlFor="staff-password" hint="At least 10 characters. Leave blank to generate a strong one.">
            <Input id="staff-password" name="password" type="password" autoComplete="new-password" minLength={10} />
          </Field>
        </div>
        <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
      </form>
      <div aria-live="polite">
        {state?.ok && (
          <Banner tone="good" title={state.message}>
            {state.generatedPassword ? (
              <div className="mt-1 space-y-2">
                <p>
                  Give {state.email} this password through a private channel. It is shown only once and is not stored in readable form.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-surface px-2 py-1 font-mono text-sm text-ink">{state.generatedPassword}</code>
                  <CopyText value={state.generatedPassword} label="Copy the generated password" />
                </div>
              </div>
            ) : (
              <p>They can sign in at /login with the password you set.</p>
            )}
          </Banner>
        )}
      </div>
    </div>
  );
}
