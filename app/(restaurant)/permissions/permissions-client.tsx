"use client";
import { useEffect, useMemo, useState } from "react";
import { LoadingOverlay, PageLoader, Spinner } from "@/components/ui/loading";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { fetchJson } from "@/lib/fetch-json";
import { Pencil, UserX } from "lucide-react";

type Role = string;
type Matrix = Record<Role, Record<string, boolean>>;
type Category = { id: string; name: string };

type Employee = { id: string; name: string; role: string; status: string; is_user: boolean };
type RoleOption = { id: string; name: string; is_system: boolean };
type UserRow = {
  id: string;
  employee_id: string;
  is_active: boolean;
  created_at: string;
  employees: { name: string; role: string; status: string } | null;
};

const SYSTEM_ROLE_META: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#D9481F" },
  manager: { label: "Manager", color: "#3F6E52" },
  cashier: { label: "Cashier", color: "#4C7EA8" },
  inventory: { label: "Inventory Manager", color: "#C99A3E" },
};
const CUSTOM_ROLE_COLORS = ["#8A6FD1", "#2E8B8B", "#B0556A", "#6F8A4A", "#C97A4A"];
function roleMeta(role: string): { label: string; color: string } {
  if (SYSTEM_ROLE_META[role]) return SYSTEM_ROLE_META[role];
  let hash = 0;
  for (const c of role) hash = (hash * 31 + c.charCodeAt(0)) % CUSTOM_ROLE_COLORS.length;
  return { label: role.length ? role[0].toUpperCase() + role.slice(1) : role, color: CUSTOM_ROLE_COLORS[hash] };
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pos: "POS",
  sales: "Sales",
  customers: "Customers",
  inventory: "Inventory",
  restock: "Restock",
  products: "Products",
  recipes: "Recipes",
  suppliers: "Suppliers",
  supplierLedger: "Supplier Ledger",
  employees: "Employees",
  employeeLedger: "Employee Ledger",
  accounts: "Accounts",
  expenses: "Expenses",
  menu: "Menu",
  tables: "Tables",
  settings: "Settings",
  admin: "Admin",
};

/**
 * Matches the prototype's view-admin ("Users & Permissions") 1:1, with the former standalone
 * Users page folded in as the top panel: system users (grant/revoke login access), the role
 * permission matrix, default shift timings, and expense categories.
 */
export function PermissionsClient({ canManageUsers }: { canManageUsers: boolean }) {
  // ---- system users (formerly the standalone /dashboard/users page) ----
  const [users, setUsers] = useState<UserRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [fEmployeeId, setFEmployeeId] = useState("");
  const [fRole, setFRole] = useState("");
  const [fPin, setFPin] = useState("");
  const [fError, setFError] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  async function loadUsers() {
    setUsersLoading(true);
    setUsersLoadError("");
    const [uRes, eRes, rRes] = await Promise.all([
      fetchJson<{ users: UserRow[] }>("/api/users"),
      fetchJson<{ employees: Employee[] }>("/api/employees"),
      fetchJson<{ roles: RoleOption[] }>("/api/roles"),
    ]);
    if (!uRes.ok) setUsersLoadError(uRes.error);
    setUsers(uRes.data?.users ?? []);
    setEmployees(eRes.data?.employees ?? []);
    setRoleOptions(rRes.data?.roles ?? []);
    setUsersLoading(false);
  }
  useEffect(() => {
    loadUsers();
  }, []);

  const availableEmployees = employees.filter((e) => e.status === "active" && !e.is_user);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = [u.employees?.name ?? "", u.employees?.role ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [users, userSearch]);

  function openAddUser() {
    setEditingUserId(null);
    setFEmployeeId(availableEmployees[0]?.id ?? "");
    setFRole(availableEmployees[0]?.role ?? roleOptions[0]?.name ?? "");
    setFPin("");
    setFError("");
    setUserFormOpen(true);
  }

  function openEditUser(u: UserRow) {
    setEditingUserId(u.employee_id);
    setFEmployeeId(u.employee_id);
    setFRole(u.employees?.role ?? roleOptions[0]?.name ?? "");
    setFPin("");
    setFError("");
    setUserFormOpen(true);
  }

  async function saveUser() {
    if (!fEmployeeId) {
      setFError("Select an employee");
      return;
    }
    if (!editingUserId && !/^\d{4}$/.test(fPin)) {
      setFError("A 4-digit PIN is required for a new user");
      return;
    }
    if (fPin && !/^\d{4}$/.test(fPin)) {
      setFError("PIN must be exactly 4 digits");
      return;
    }
    setSavingUser(true);
    setFError("");
    const row: Record<string, unknown> = { id: fEmployeeId, role: fRole };
    if (fPin) row.pin = fPin;
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row }),
    });
    setSavingUser(false);
    if (!res.ok) {
      setFError((await res.json()).error ?? "Could not save");
      return;
    }
    setUserFormOpen(false);
    await loadUsers();
  }

  async function revokeUser(u: UserRow) {
    if (!confirm(`Revoke login access for ${u.employees?.name ?? "this user"}? They'll stay on the employee roster.`)) return;
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "revokeUser", row: { id: u.employee_id } }),
    });
    if (res.ok) await loadUsers();
  }

  // ---- role permission matrix / shift timings / expense categories (unchanged) ----
  const [modules, setModules] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [permMsg, setPermMsg] = useState("");

  const [shiftStart, setShiftStart] = useState("14:00");
  const [shiftEnd, setShiftEnd] = useState("02:00");
  const [shiftMsg, setShiftMsg] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState("");
  const [catError, setCatError] = useState("");
  const [savingShift, setSavingShift] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    (async () => {
      const [permRes, settingsRes, catRes] = await Promise.all([
        fetch("/api/permissions"),
        fetch("/api/settings"),
        fetch("/api/expense-categories"),
      ]);
      const permData = await permRes.json();
      if (permRes.ok) {
        setMatrix(permData.matrix);
        setModules(permData.modules);
        setRoles(permData.roles);
      }
      const settingsData = await settingsRes.json();
      if (settingsRes.ok && settingsData.settings) {
        setShiftStart(settingsData.settings.shift_start?.slice(0, 5) ?? "14:00");
        setShiftEnd(settingsData.settings.shift_end?.slice(0, 5) ?? "02:00");
      }
      const catData = await catRes.json();
      if (catRes.ok) setCategories(catData.categories ?? []);
    })();
  }, []);

  async function togglePerm(role: Role, module: string, canView: boolean) {
    if (role === "admin") return;
    setMatrix((prev) => (prev ? { ...prev, [role]: { ...prev[role], [module]: canView } } : prev));
    setPermMsg("");
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, module, canView }),
    });
    if (!res.ok) {
      const data = await res.json();
      setPermMsg(data.error || "Could not save");
      setMatrix((prev) => (prev ? { ...prev, [role]: { ...prev[role], [module]: !canView } } : prev));
      return;
    }
    setPermMsg(`Permission updated for ${roleMeta(role).label}`);
    setTimeout(() => setPermMsg(""), 2000);
  }

  async function saveShift() {
    setShiftMsg("");
    setSavingShift(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shiftStart, shiftEnd }),
    });
    setSavingShift(false);
    if (!res.ok) {
      setShiftMsg((await res.json()).error || "Could not save");
      return;
    }
    setShiftMsg("Default shift timing saved");
    setTimeout(() => setShiftMsg(""), 2500);
  }

  async function addCategory() {
    const name = newCat.trim();
    if (!name) {
      setCatError("Enter a category name");
      return;
    }
    setCatError("");
    setAddingCategory(true);
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name } }),
    });
    const data = await res.json();
    setAddingCategory(false);
    if (!res.ok) {
      setCatError(data.error);
      return;
    }
    setNewCat("");
    const res2 = await fetch("/api/expense-categories");
    setCategories((await res2.json()).categories ?? []);
  }

  async function removeCategory(cat: Category) {
    setCatError("");
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id: cat.id } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCatError(data.error);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
  }

  return (
    <main className="p-6 md:p-8 space-y-5">
      {/* ---- System users (top panel) ---- */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search name or role…"
            className={searchInputCls}
          />
        </div>
        {canManageUsers && (
          <button
            onClick={openAddUser}
            disabled={availableEmployees.length === 0}
            className={`${addBtnCls} ml-auto disabled:opacity-40`}
            title={availableEmployees.length === 0 ? "Every active employee already has a user account" : undefined}
          >
            + Add User
          </button>
        )}
      </div>

      {usersLoadError && (
        <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-sm text-crimson-400">
          Couldn&apos;t load users: {usersLoadError}
        </p>
      )}

      <Panel loading={usersLoading}>
        <PanelHead title="System users" subtitle="Employees who currently have a login (PIN) — see the Employees page for the full roster" />
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Added</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <Td className="font-medium text-ink-strong">{u.employees?.name ?? "—"}</Td>
                  <Td className="text-ink-mid capitalize">{u.employees?.role ?? "—"}</Td>
                  <Td>
                    <Badge tone={u.is_active ? "basil" : "steel"}>{u.is_active ? "Active" : "Revoked"}</Badge>
                  </Td>
                  <Td className="text-ink-mid">{u.created_at.slice(0, 10)}</Td>
                  <Td>
                    {canManageUsers && (
                      <div className="flex gap-1.5">
                        <IconBtn title="Edit (change PIN or role)" onClick={() => openEditUser(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        {u.is_active && (
                          <IconBtn title="Revoke access" onClick={() => revokeUser(u)}>
                            <UserX className="h-3.5 w-3.5" />
                          </IconBtn>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {!usersLoading && filteredUsers.length === 0 && (
                <EmptyRow colSpan={5} label={userSearch ? "No users match that search." : "No users yet — add one from an existing employee."} />
              )}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {/* ---- Role permission matrix ---- */}
      <div className="relative rounded-xl border border-line bg-surface p-6">
        <div className="mb-4">
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">Role permissions</h3>
          <div className="text-xs text-ink-faint mt-0.5">
            Controls which modules each role can access. Admin always has full access.
          </div>
        </div>
        {permMsg && <p className="text-xs text-basil-400 mb-3">{permMsg}</p>}
        {!matrix ? (
          <PageLoader label="Loading permissions…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-surface">Role</th>
                  {modules.map((m) => (
                    <th key={m} className="text-center p-2 text-xs text-ink-faint font-medium whitespace-nowrap">
                      {MODULE_LABELS[m] ?? m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role} className="border-t border-line-soft">
                    <td className="p-2 sticky left-0 bg-surface">
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
                        style={{ background: `${roleMeta(role).color}22`, color: roleMeta(role).color }}
                      >
                        {roleMeta(role).label}
                      </span>
                    </td>
                    {modules.map((m) => (
                      <td key={m} className="text-center p-2">
                        <input
                          type="checkbox"
                          checked={matrix[role][m]}
                          disabled={role === "admin"}
                          onChange={(e) => togglePerm(role, m, e.target.checked)}
                          className="w-4 h-4 accent-chili-500 disabled:opacity-40"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Shift timings + expense categories ---- */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="relative rounded-xl border border-line bg-surface p-6">
          <div className="mb-4">
            <h3 className="font-display font-semibold text-ink-strong text-[15px]">Default shift timings</h3>
            <div className="text-xs text-ink-faint mt-0.5">Applied restaurant-wide, supports overnight shifts</div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-1">
            <label className="block">
              <span className="text-xs font-semibold text-ink-mid">Shift start</span>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full rounded-lg bg-raised border border-line px-3 py-2 text-sm mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-mid">Shift end</span>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full rounded-lg bg-raised border border-line px-3 py-2 text-sm mt-1"
              />
            </label>
          </div>
          <p className="text-xs text-ink-faint mb-3.5">
            Overnight shifts are supported — end time may fall on the next day. Restock dates default to the current
            shift&apos;s start date.
          </p>
          {shiftMsg && <p className="text-xs text-basil-400 mb-2">{shiftMsg}</p>}
          <button
            onClick={saveShift}
            disabled={savingShift}
            className="inline-flex items-center gap-1.5 rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            {savingShift && <Spinner size={14} />}
            Save default shift
          </button>
          <LoadingOverlay show={savingShift} />
        </div>

        <div className="relative rounded-xl border border-line bg-surface p-6">
          <div className="mb-4">
            <h3 className="font-display font-semibold text-ink-strong text-[15px]">Expense categories</h3>
            <div className="text-xs text-ink-faint mt-0.5">Used when logging expense ledger entries</div>
          </div>
          <div className="space-y-1.5 mb-3">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
                <span>{c.name}</span>
                <button onClick={() => removeCategory(c)} className="text-ink-faint hover:text-crimson-400 text-xs">
                  ✕
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-xs text-ink-faint">No categories yet — add one below.</p>}
          </div>
          {catError && <p className="text-xs text-crimson-400 mb-2">{catError}</p>}
          <div className="flex gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="e.g. Marketing"
              className="flex-1 rounded-lg bg-raised border border-line px-3 py-2 text-sm"
            />
            <button
              onClick={addCategory}
              disabled={addingCategory}
              className="inline-flex items-center gap-1.5 rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0"
            >
              {addingCategory && <Spinner size={14} />}
              Add
            </button>
          </div>
          <LoadingOverlay show={addingCategory} />
        </div>
      </div>

      {/* ---- Add / edit user modal ---- */}
      <Modal
        busy={savingUser}
        open={userFormOpen}
        onClose={() => setUserFormOpen(false)}
        title={editingUserId ? "Edit user" : "Add user"}
        footer={
          <>
            <button onClick={() => setUserFormOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveUser} disabled={savingUser} className={btnPrimary}>
              {savingUser ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {fError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{fError}</p>}
        <Field label="Employee">
          {editingUserId ? (
            <input value={users.find((u) => u.employee_id === editingUserId)?.employees?.name ?? ""} disabled className={inputCls} />
          ) : (
            <select value={fEmployeeId} onChange={(e) => setFEmployeeId(e.target.value)} className={inputCls}>
              {availableEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Role">
          <select value={fRole} onChange={(e) => setFRole(e.target.value)} className={inputCls}>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={editingUserId ? "New PIN (leave blank to keep current)" : "4-digit PIN"}>
          <input
            value={fPin}
            onChange={(e) => setFPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            className={inputCls}
          />
        </Field>
      </Modal>
    </main>
  );
}