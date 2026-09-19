import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { getPermissionMatrix, setModuleAccess, PERMISSION_MODULES, ROLES, type PermModule, type Role } from "@/lib/permissions";

/** Only Admin can view/edit this page (see hasModuleAccess(..., "admin") gate on the page
 *  itself) — this route re-checks the same thing server-side rather than trusting the page
 *  guard alone, same as every other write endpoint in this codebase. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const matrix = await getPermissionMatrix(session.restaurantId);
  return NextResponse.json({ matrix, modules: PERMISSION_MODULES, roles: ROLES });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { role, module, canView } = (await req.json().catch(() => ({}))) as {
    role?: Role;
    module?: PermModule;
    canView?: boolean;
  };
  if (!role || !module || typeof canView !== "boolean") {
    return NextResponse.json({ error: "role, module and canView are required" }, { status: 400 });
  }
  if (!ROLES.includes(role) || !PERMISSION_MODULES.includes(module)) {
    return NextResponse.json({ error: "Unknown role or module" }, { status: 400 });
  }
  if (role === "admin") {
    return NextResponse.json({ error: "Admin always has full access" }, { status: 400 });
  }

  const result = await setModuleAccess(session.restaurantId, role, module, canView);
  if (result?.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
