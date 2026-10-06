import "server-only";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/types";

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

/**
 * Run a server-action body, turning expected service errors into a message for
 * the form. Unexpected errors still throw (and reach error.tsx / logs).
 * Note: call redirect()/revalidatePath() outside this wrapper or after it returns.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
