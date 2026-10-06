import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/server/session";

// Optimistic routing only: reads the signed cookie, never the database.
// Every page, action and service re-checks authorization securely (see server/dal.ts).
const HOME = { student: "/student", teacher: "/teacher", admin: "/admin" } as const;
const AREA: Record<string, "student" | "teacher" | "admin"> = {
  "/student": "student",
  "/teacher": "teacher",
  "/admin": "admin",
};

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  const area = Object.keys(AREA).find((p) => path === p || path.startsWith(p + "/"));
  if (area) {
    if (!session) return NextResponse.redirect(new URL("/login", req.nextUrl));
    // Admins may open every area; teachers and students only their own.
    if (session.role !== "admin" && session.role !== AREA[area]) {
      return NextResponse.redirect(new URL(HOME[session.role], req.nextUrl));
    }
  }

  if (session && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL(HOME[session.role], req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
