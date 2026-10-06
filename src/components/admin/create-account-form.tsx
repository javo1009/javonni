"use client";

import { useState, useTransition } from "react";
import { createAccountAction } from "@/app/actions/admin";
import {
  Banner,
  Button,
  Field,
  FormError,
  Input,
  Select,
} from "@/components/ui";
import { CopyButton } from "./copy-button";
import { PasswordField } from "./password-field";

type Role = "student" | "teacher" | "admin";
type Created = { email: string; role: string; password: string };

const ROLE_HINT: Record<Role, string> = {
  teacher: "Teachers run classes, set homework and review students' work.",
  student:
    "Students normally join themselves with a class code. Create one here only for someone who can't.",
  admin:
    "Admins can see and change everything on the platform. Keep this to people who need it.",
};

export function CreateAccountForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setCreated(null);
    start(async () => {
      const r = await createAccountAction({ name, email, role, password });
      if (!r.ok) return setError(r.error);
      setCreated({ email: r.data.email, role: r.data.role, password });
      setName("");
      setEmail("");
      setPassword("");
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="space-y-4"
        aria-label="Create an account"
      >
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Full name" htmlFor="new-name">
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              maxLength={254}
            />
          </Field>
          <Field label="Role" htmlFor="new-role" hint={ROLE_HINT[role]}>
            <Select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <PasswordField
            id="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <div aria-live="polite">
        {created && (
          <Banner
            tone="good"
            title={`Created the ${created.role} account for ${created.email}`}
          >
            <div className="mt-1.5 space-y-2">
              <p>
                Give them this temporary password through a private channel. It
                is not stored in readable form and can&apos;t be shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="break-all rounded bg-surface px-2 py-1 font-mono text-sm text-ink"
                  data-testid="created-password"
                >
                  {created.password}
                </code>
                <CopyButton
                  value={created.password}
                  label="Copy the temporary password"
                />
              </div>
            </div>
          </Banner>
        )}
      </div>
    </div>
  );
}
