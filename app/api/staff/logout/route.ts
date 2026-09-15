import { NextResponse } from "next/server";
import { STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";

/** Clears the httpOnly staff session cookie — client JS can't do this directly since the
 *  cookie is httpOnly (deliberately, so it isn't readable/stealable via XSS). */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(STAFF_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
