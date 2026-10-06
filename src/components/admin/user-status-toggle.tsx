"use client";

import { useActionState } from "react";
import { setUserDisabledAction, type SimpleState } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export function UserStatusToggle({ userId, name, disabled }: { userId: string; name: string; disabled: boolean }) {
  const [state, action] = useActionState<SimpleState, FormData>(setUserDisabledAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
      <SubmitButton
        size="sm"
        variant={disabled ? "secondary" : "ghost"}
        pendingLabel={disabled ? "Enabling…" : "Disabling…"}
        aria-label={`${disabled ? "Enable" : "Disable"} ${name}`}
      >
        {disabled ? "Enable" : "Disable"}
      </SubmitButton>
      {state?.ok === false && (
        <p role="alert" className="text-sm text-risk">
          {state.error}
        </p>
      )}
      <span role="status" className="sr-only">
        {state?.ok ? state.message : ""}
      </span>
    </form>
  );
}
