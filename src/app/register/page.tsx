import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Join your class" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <AuthLayout title="Join your class" subtitle="Create your account with the code from your teacher.">
      <RegisterForm defaultCode={typeof code === "string" ? code.slice(0, 12) : undefined} />
    </AuthLayout>
  );
}
