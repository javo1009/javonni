import type { Db } from "@/db/client";

export type Role = "student" | "teacher" | "admin";

/** The authenticated caller. Services authorize against this; they never trust ids from input alone. */
export type Actor = { id: string; role: Role };

export type { Db };

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
