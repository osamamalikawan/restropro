import { NextResponse, type NextRequest } from "next/server";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";

/** Protects the restaurant app. Owner-facing Supabase-Auth routes are protected separately
 *  by RLS + server-side checks in their own layouts; this middleware specifically guards the
 *  PIN-authenticated staff app, since that traffic carries our own cookie, not a Supabase one. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isRestaurantApp = pathname.startsWith("/dashboard") || pathname.startsWith("/pos");
  if (!isRestaurantApp) return NextResponse.next();

  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // NOTE: session_version and subscription grace/expired status still need a DB check —
  // middleware runs on the edge and shouldn't do a full DB round trip on every request.
  // The pattern used here: trust the signed cookie for identity, but re-verify
  // session_version + subscription status inside each server action / API route before any
  // mutating operation (see app/(restaurant)/dashboard/page.tsx for where that check lives).
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/pos/:path*"],
};
