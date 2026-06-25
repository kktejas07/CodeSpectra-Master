import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 root proxy (replaces middleware) for CodeSpectra.
 *
 * Phase 1.5: We do an OPTIMISTIC cookie-presence check using Better Auth's
 * `getSessionCookie` helper. This is fast (no DB roundtrip) but only proves
 * a cookie exists, not that the session is valid. Full server-side
 * validation must still happen in every protected route handler / page via
 * `auth.api.getSession()`.
 *
 * RBAC routing (role-aware redirects) is intentionally deferred to Phase 2
 * when profiles/roles live in MongoDB and can be read here. For now,
 * authenticated users with any role can reach /dashboard/* and /admin/*;
 * individual pages enforce role at render time.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: "codespectra",
  });

  if (!sessionCookie) {
    // DEMO MODE: while MONGODB_URI is unset, let users preview /dashboard/* and /admin/*
    // pages without authentication so they can see what was built. Remove this
    // block in production.
    if (!process.env.MONGODB_URI) {
      return NextResponse.next()
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
