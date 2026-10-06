"use client";

import { useActionState } from "react";
import { publishAssignmentAction, type PublishState } from "@/app/actions/teacher";
import { FormError } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function PublishButton({ assignmentId }: { assignmentId: string }) {
  const [state, action] = useActionState<PublishState, FormData>(publishAssignmentAction, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <SubmitButton pendingLabel="Assigning…">Assign to students</SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}
