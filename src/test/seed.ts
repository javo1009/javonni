import { ensureOfficialCurriculum, seedSampleQuestions } from "@/db/seed/official";
import { getActiveCurriculum } from "@/services/curriculum";
import type { Actor, Db, Role } from "@/services/types";
import { createUser } from "@/services/users";

/** Official 2027 curriculum + sample questions in a test database. */
export async function seedBase(db: Db) {
  const c = await ensureOfficialCurriculum(db);
  await seedSampleQuestions(db, c.versionId);
  return getActiveCurriculum(db);
}

export async function makeActor(db: Db, email: string, role: Role, timezone?: string): Promise<Actor> {
  const u = await createUser(db, { email, name: email.split("@")[0], role, password: "a-long-password-1", timezone });
  return { id: u.id, role };
}

export const slugModule = (cur: Awaited<ReturnType<typeof getActiveCurriculum>>, slug: string) => {
  const m = cur.moduleBySlug.get(slug);
  if (!m) throw new Error(`no module ${slug}`);
  return m;
};
