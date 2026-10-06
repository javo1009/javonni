"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/db/client";
import { ROLE_HOME } from "@/server/dal";
import { createSession, deleteSession } from "@/server/session";
import { authenticate, registerStudent } from "@/services/users";
import { ValidationError } from "@/services/types";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
});

const RegisterSchema = z.object({
  name: z.string().trim().min(2, { error: "Enter your name." }).max(80),
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z
    .string()
    .min(10, { error: "Use at least 10 characters." })
    .max(200, { error: "That password is too long." }),
  joinCode: z.string().trim().min(4, { error: "Enter the class code from your teacher." }).max(20),
  timezone: z.string().max(64).optional(),
});

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const user = await authenticate(getDb(), parsed.data.email, parsed.data.password);
  if (!user) return { error: "Email or password is incorrect." };
  await createSession(user.id, user.role);
  redirect(ROLE_HOME[user.role]);
}

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    joinCode: formData.get("joinCode"),
    timezone: formData.get("timezone") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const user = await registerStudent(getDb(), parsed.data);
    await createSession(user.id, user.role);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  redirect(ROLE_HOME.student);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
