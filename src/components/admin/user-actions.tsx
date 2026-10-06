"use client";

import { useState, useTransition } from "react";
import {
  resetPasswordAction,
  setUserDisabledAction,
} from "@/app/actions/admin";
import { Banner, Button, FormError } from "@/components/ui";
import { CopyButton } from "./copy-button";
import { Dialog } from "./dialog";
import { PasswordField } from "./password-field";

type Props = {
  userId: string;
  name: string;
  email: string;
  disabled: boolean;
  /** Why this account can't be disabled (yourself, the last active admin); null when it can. */
  cannotDisable: string | null;
};

export function UserActions({
  userId,
  name,
  email,
  disabled,
  cannotDisable,
}: Props) {
  const [dialog, setDialog] = useState<null | "disable" | "reset">(null);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setDialog(null);
    setError(undefined);
    setPassword("");
    setDone(null);
  };

  function toggle(next: boolean) {
    setError(undefined);
    start(async () => {
      const r = await setUserDisabledAction(userId, next);
      if (!r.ok) {
        // Outside a dialog (enabling) show the problem inline; inside one it renders in the dialog.
        setError(r.error);
        return;
      }
      setNotice(`${name} is now ${next ? "disabled" : "enabled"}.`);
      close();
    });
  }

  function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await resetPasswordAction(userId, password);
      if (!r.ok) return setError(r.error);
      setNotice(`Password reset for ${name}.`);
      setDone(password);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5 max-sm:items-start">
      <div className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDialog("reset")}
          aria-label={`Reset password for ${name}`}
        >
          Reset password
        </Button>
        {disabled ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => toggle(false)}
            aria-label={`Enable ${name}`}
          >
            {pending ? "Enabling…" : "Enable"}
          </Button>
        ) : cannotDisable ? (
          <span className="self-center text-xs text-ink-2">
            {cannotDisable}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog("disable")}
            aria-label={`Disable ${name}`}
          >
            Disable
          </Button>
        )}
      </div>
      {!dialog && error && (
        <p
          role="alert"
          className="max-w-56 text-right text-sm text-risk max-sm:text-left"
        >
          {error}
        </p>
      )}
      <span role="status" className="sr-only">
        {notice}
      </span>

      <Dialog
        open={dialog === "disable"}
        onClose={close}
        title={`Disable ${name}?`}
        description={`${email} will be signed out on their next request and can't sign in until you enable the account again. Their data is kept.`}
      >
        <FormError message={error} />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            aria-busy={pending}
            onClick={() => toggle(true)}
          >
            {pending ? "Disabling…" : `Disable ${name}`}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "reset"}
        onClose={close}
        title={done ? "Password reset" : `Reset password for ${name}`}
        description={
          done
            ? undefined
            : `Set a new temporary password for ${email}. Their current password stops working immediately.`
        }
      >
        {done ? (
          <div className="space-y-4">
            <Banner
              tone="good"
              title={`${name} can sign in with the new password`}
            >
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-surface px-2 py-1 font-mono text-sm text-ink">
                  {done}
                </code>
                <CopyButton value={done} label="Copy the new password" />
              </div>
              <p className="mt-2">
                Share it through a private channel. It can&apos;t be shown
                again.
              </p>
            </Banner>
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={reset} className="space-y-4">
            <PasswordField
              id={`reset-${userId}`}
              label="New temporary password"
              value={password}
              onChange={setPassword}
              autoFocus
            />
            <FormError message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? "Resetting…" : "Reset password"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
