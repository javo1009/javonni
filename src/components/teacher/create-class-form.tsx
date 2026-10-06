"use client";

import { useActionState } from "react";
import { createClassAction, type CreateClassState } from "@/app/actions/teacher";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateClassForm() {
  const [state, action] = useActionState<CreateClassState, FormData>(createClassAction, undefined);
  const fe = state?.fieldErrors;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <Field label="Class name" htmlFor="class-name" hint="Students see this when they join." errors={fe?.name}>
        <Input
          id="class-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Level I · Saturday group"
          defaultValue={state?.values?.name}
          aria-describedby={fe?.name ? "class-name-error" : undefined}
          aria-invalid={fe?.name ? true : undefined}
        />
      </Field>
      <Field label="Exam date (optional)" htmlFor="class-exam" errors={fe?.examDate}>
        <Input
          id="class-exam"
          name="examDate"
          type="date"
          defaultValue={state?.values?.examDate}
          aria-describedby={fe?.examDate ? "class-exam-error" : undefined}
        />
      </Field>
      <SubmitButton pendingLabel="Creating…">Create class</SubmitButton>
    </form>
  );
}
