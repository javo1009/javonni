"use client";

import { useActionState, useState } from "react";
import { activateVersionAction, type SimpleState } from "@/app/actions/admin";
import { Button } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

/** Two-step "make active" control: activation changes what every new plan is built from. */
export function ActivateVersion({ versionId, name }: { versionId: string; name: string }) {
  const [state, action] = useActionState<SimpleState, FormData>(activateVersionAction, undefined);
  const [confirming, setConfirming] = useState(false);
  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-good">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="versionId" value={versionId} />
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label={`Confirm activating ${name}`}>
          <span className="text-sm text-ink-2">New plans will use this version.</span>
          <SubmitButton size="sm" pendingLabel="Activating…">
            Confirm
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)} aria-label={`Make ${name} the active version`}>
          Make active
        </Button>
      )}
      {state?.ok === false && (
        <p role="alert" className="text-sm text-risk">
          {state.error}
        </p>
      )}
    </form>
  );
}
