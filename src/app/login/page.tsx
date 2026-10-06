import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up today's plan."
      aside={
        DEMO ? (
          <div className="mt-8 rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="font-semibold text-ink">Demo accounts</p>
            <p className="mt-1 text-ink-2">
              Password for all: <code className="rounded bg-surface-2 px-1">ascent-demo-2027</code>
            </p>
            <ul className="mt-2 space-y-0.5 text-ink-2">
              <li>
                Student: <code>dana@ascent.demo</code> (or omar, marco, priya…)
              </li>
              <li>
                Teacher: <code>teacher@ascent.demo</code>
              </li>
              <li>
                Admin: <code>admin@ascent.demo</code>
              </li>
            </ul>
          </div>
        ) : null
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
