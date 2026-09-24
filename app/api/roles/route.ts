import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRoles, SYSTEM_ROLES } from "@/lib/permissions";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const roles = await listRoles(session.restaurantId);
  return NextResponse.json({ roles });
}

/** Admin only. Body: { op: "insert", name } creates a new custom role, starting with zero
 *  module access until configured on the Users & Permissions page — see lib/permissions.ts's
 *  DEFAULTS comment for why a blank slate is the safe default for something brand new.
 *  { op: "delete", id } removes a custom role — refused for system roles, and refused while
 *  any employee is still assigned it (reassign them first). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { op, name, id } = (await req.json().catch(() => ({}))) as { op?: string; name?: string; id?: string };
  const admin = createAdminClient();

  if (op === "delete") {
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { data: role } = await admin.from("roles").select("name, is_system").eq("id", id).eq("restaurant_id", session.restaurantId).single();
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    if (role.is_system) return NextResponse.json({ error: "System roles can't be removed" }, { status: 400 });

    const { count } = await admin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", session.restaurantId)
      .eq("role", role.name);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: `${count} employee(s) still have this role — reassign them first` }, { status: 400 });
    }

    await admin.from("role_permissions").delete().eq("restaurant_id", session.restaurantId).eq("role", role.name);
    const { error } = await admin.from("roles").delete().eq("id", id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // insert
  const trimmed = name?.trim();
  if (!trimmed) return NextResponse.json({ error: "Enter a role name" }, { status: 400 });
  if ((SYSTEM_ROLES as readonly string[]).includes(trimmed.toLowerCase())) {
    return NextResponse.json({ error: "That name is reserved for a system role" }, { status: 400 });
  }

  const { error } = await admin.from("roles").insert({ restaurant_id: session.restaurantId, name: trimmed, is_system: false });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That role already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
