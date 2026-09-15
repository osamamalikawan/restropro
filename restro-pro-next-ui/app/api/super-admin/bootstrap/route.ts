import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time bootstrap: creates the FIRST super admin. Self-disables by checking whether any
 * super_admins row already exists — once one does, this route always 403s, forever, so it
 * can safely stay deployed without becoming a standing backdoor.
 *
 * Usage (once, right after your first deploy):
 *   curl -X POST https://your-app.vercel.app/api/super-admin/bootstrap \
 *     -H "content-type: application/json" \
 *     -d '{"email":"admin@restropro.com","password":"...","bootstrapSecret":"..."}'
 *
 * Set BOOTSTRAP_SECRET in your env — this route also checks it so it isn't a fully open POST.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();

  const { count } = await admin.from("super_admins").select("*", { count: "exact", head: true });
  if (count && count > 0) {
    return NextResponse.json({ error: "A super admin already exists. This route is now permanently disabled." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, password, bootstrapSecret } = body as { email?: string; password?: string; bootstrapSecret?: string };

  if (!process.env.BOOTSTRAP_SECRET || bootstrapSecret !== process.env.BOOTSTRAP_SECRET) {
    return NextResponse.json({ error: "Invalid bootstrap secret" }, { status: 401 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  // If a previous attempt got partway through (e.g. schema wasn't migrated yet when this ran),
  // there may already be an auth user for this email with no matching super_admins row.
  // Reuse that user instead of erroring, so a retry after fixing the schema just works.
  let userId: string;
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    userId = existing.id;
  } else {
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authUser.user) {
      return NextResponse.json({ error: authError?.message || "Could not create user" }, { status: 500 });
    }
    userId = authUser.user.id;
  }

  const { error: insertError } = await admin.from("super_admins").insert({ user_id: userId });
  if (insertError) {
    // Only roll back the user if we just created it ourselves this call — never delete a
    // pre-existing account we merely reused above.
    if (!existing) await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Super admin created. This route is now disabled." });
}
