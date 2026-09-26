import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "@/lib/admin/constants";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/admin/session-token";

// Optimistic check only. Next.js dispatches a Server Action by its Next-Action ID, not by URL,
// so this proxy is NOT a protection for Server Actions (a POST to /admin/login can carry any
// action ID). Every page, Server Action and data function must call requireAdmin() itself
// (lib/admin/auth.ts); tests/app/admin/server-actions-auth.test.ts enforces this for actions.
export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = verifySessionToken(token, process.env.ADMIN_SESSION_SECRET);

  if (pathname === ADMIN_LOGIN_PATH) {
    if (authenticated && request.method === "GET") {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
