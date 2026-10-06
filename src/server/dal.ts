import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getUserById, type PublicUser } from "@/services/users";
import type { Actor, Role } from "@/services/types";
import { readSession } from "./session";

export const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
};

/**
 * Secure check: the cookie must be valid AND the user must still exist and be
 * enabled. Memoized per render pass. Returns null when signed out.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await getUserById(getDb(), session.sub);
  // Trust the database over the cookie for the role.
  return user;
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require one of the given roles; anyone else is sent to their own home. */
export async function requireRole(...roles: Role[]): Promise<PublicUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

export const toActor = (u: PublicUser): Actor => ({ id: u.id, role: u.role });
