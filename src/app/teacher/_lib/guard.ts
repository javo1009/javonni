import "server-only";
import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/services/types";
import { isUuid } from "@/services/teacher-views";

/** 404 for malformed ids, missing records and records the teacher can't see (don't leak existence). */
export async function orNotFound<T>(id: unknown, load: (id: string) => Promise<T>): Promise<T> {
  if (!isUuid(id)) notFound();
  try {
    return await load(id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
}
