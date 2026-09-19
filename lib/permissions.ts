import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "admin" | "manager" | "cashier" | "inventory";

/** Matches nav-config.ts's NavItem.perm values 1:1, and the DB check constraint on
 *  role_permissions.module. "pos" also gates Ticket Rail, "sales" also gates Unpaid Orders,
 *  and "settings" also gates Payment Methods — same doubling-up the prototype's own
 *  data-perm attributes use. */
export const PERMISSION_MODULES = [
  "dashboard", "pos", "sales", "customers", "inventory", "restock", "products", "recipes",
  "suppliers", "supplierLedger", "employees", "employeeLedger", "accounts", "expenses",
  "menu", "tables", "settings", "admin",
] as const;
export type PermModule = (typeof PERMISSION_MODULES)[number];

export const ROLES: Role[] = ["admin", "manager", "cashier", "inventory"];

/** Default view-access-by-role, ported from the prototype's seeded permission matrix
 *  (scripts/data/seed-data.js — ADMIN/MANAGER/CASHIER/INVENTORY_PERMS). Used purely to seed
 *  a tenant's role_permissions rows the first time anyone reads them — after that, whatever
 *  is in the table (as edited on the Users & Permissions page) is the source of truth. */
const DEFAULTS: Record<Role, PermModule[] | "all"> = {
  admin: "all",
  manager: [
    "dashboard", "pos", "sales", "customers", "inventory", "restock", "suppliers",
    "supplierLedger", "employees", "employeeLedger", "accounts", "expenses", "menu", "tables",
  ],
  cashier: ["dashboard", "pos", "sales", "customers", "tables"],
  inventory: ["dashboard", "inventory", "restock", "suppliers"],
};

function defaultRows(restaurantId: string) {
  const rows: { restaurant_id: string; role: Role; module: PermModule; can_view: boolean }[] = [];
  for (const role of ROLES) {
    const allowed = DEFAULTS[role];
    for (const module of PERMISSION_MODULES) {
      rows.push({ restaurant_id: restaurantId, role, module, can_view: allowed === "all" || allowed.includes(module) });
    }
  }
  return rows;
}

/** Full role×module matrix for a tenant, seeding the default rows on first read (mirrors
 *  the same lazy-create-on-read pattern /api/settings uses for restaurant_settings). Used
 *  by the Users & Permissions page to render/edit the whole grid. */
export async function getPermissionMatrix(restaurantId: string): Promise<Record<Role, Record<PermModule, boolean>>> {
  const admin = createAdminClient();
  let { data } = await admin
    .from("role_permissions")
    .select("role, module, can_view")
    .eq("restaurant_id", restaurantId);

  if (!data || data.length === 0) {
    const rows = defaultRows(restaurantId);
    const { error } = await admin.from("role_permissions").insert(rows);
    if (!error) data = rows;
  }

  const matrix = Object.fromEntries(
    ROLES.map((role) => [role, Object.fromEntries(PERMISSION_MODULES.map((m) => [m, false]))])
  ) as Record<Role, Record<PermModule, boolean>>;
  for (const row of data ?? []) {
    if (matrix[row.role as Role]) matrix[row.role as Role][row.module as PermModule] = row.can_view;
  }
  matrix.admin = Object.fromEntries(PERMISSION_MODULES.map((m) => [m, true])) as Record<PermModule, boolean>;
  return matrix;
}

/** Just the current employee's own accessible modules — what the dashboard layout/sidebar
 *  and per-page guards actually need on every request, without pulling the full 4-role grid. */
export async function getModuleAccess(restaurantId: string, role: Role): Promise<Record<PermModule, boolean>> {
  if (role === "admin") {
    return Object.fromEntries(PERMISSION_MODULES.map((m) => [m, true])) as Record<PermModule, boolean>;
  }
  const admin = createAdminClient();
  let { data } = await admin
    .from("role_permissions")
    .select("module, can_view")
    .eq("restaurant_id", restaurantId)
    .eq("role", role);

  if (!data || data.length === 0) {
    const rows = defaultRows(restaurantId);
    const { error } = await admin.from("role_permissions").insert(rows);
    if (!error) data = rows.filter((r) => r.role === role);
  }

  const access = Object.fromEntries(PERMISSION_MODULES.map((m) => [m, false])) as Record<PermModule, boolean>;
  for (const row of data ?? []) access[row.module as PermModule] = row.can_view;
  return access;
}

/** One-off check for a server-component page guard (e.g. "can this role open /dashboard/products?").
 *  Cheap wrapper around getModuleAccess for pages that don't otherwise need the full context. */
export async function hasModuleAccess(restaurantId: string, role: Role, module: PermModule): Promise<boolean> {
  if (role === "admin") return true;
  const access = await getModuleAccess(restaurantId, role);
  return !!access[module];
}

/** Toggles one role×module cell — the whole write path behind the Users & Permissions
 *  matrix. Module-level toggle sets a single can_view flag, same simplification the
 *  prototype's UI makes (it flips a whole CRUD-permission object per module; this schema
 *  only tracks view access per module, which is what actually gates navigation/pages here). */
export async function setModuleAccess(restaurantId: string, role: Role, module: PermModule, canView: boolean) {
  if (role === "admin") return; // Admin's row is always all-true and not editable, same as the prototype.
  const admin = createAdminClient();
  return admin
    .from("role_permissions")
    .upsert({ restaurant_id: restaurantId, role, module, can_view: canView, updated_at: new Date().toISOString() });
}
