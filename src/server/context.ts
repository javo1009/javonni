import "server-only";
import { cache } from "react";
import { getDb } from "@/db/client";
import { todayIn } from "@/lib/today";
import { getActiveCurriculum } from "@/services/curriculum";
import { NotFoundError } from "@/services/types";
import { requireRole, toActor } from "./dal";

/** The active curriculum, fetched once per request. Throws NotFoundError if none is active. */
export const getCurriculum = cache(() => getActiveCurriculum(getDb()));

/** Like getCurriculum, but null on a fresh database with no active version. */
export const getCurriculumOrNull = cache(async () => {
  try {
    return await getCurriculum();
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
});

async function contextFor(roles: Parameters<typeof requireRole>) {
  const user = await requireRole(...roles);
  return { user, actor: toActor(user), db: getDb(), today: todayIn(user.timezone), now: Date.now() };
}

export const studentContext = () => contextFor(["student"]);
export const teacherContext = () => contextFor(["teacher", "admin"]);
export const adminContext = () => contextFor(["admin"]);
