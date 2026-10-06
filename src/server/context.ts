import "server-only";
import { cache } from "react";
import { getDb } from "@/db/client";
import { todayIn } from "@/lib/today";
import { getActiveCurriculum } from "@/services/curriculum";
import { requireRole, toActor } from "./dal";

/** The active curriculum, fetched once per request. */
export const getCurriculum = cache(() => getActiveCurriculum(getDb()));

async function contextFor(roles: Parameters<typeof requireRole>) {
  const user = await requireRole(...roles);
  return { user, actor: toActor(user), db: getDb(), today: todayIn(user.timezone), now: Date.now() };
}

export const studentContext = () => contextFor(["student"]);
export const teacherContext = () => contextFor(["teacher", "admin"]);
export const adminContext = () => contextFor(["admin"]);
