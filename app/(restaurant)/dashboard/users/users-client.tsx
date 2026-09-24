"use client";
import { useEffect, useMemo, useState } from "react";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { fetchJson } from "@/lib/fetch-json";
import { Pencil, UserX } from "lucide-react";

type Employee = { id: string; name: string; role: string; status: string; is_user: boolean };
type RoleOption = { id: string; name: string; is_system: boolean };
type UserRow = {
  id: string;
  employee_id: string;
  is_active: boolean;
  created_at: string;
  employees: { name: string; role: string; status: string } | null;
};

/**
 * "Users" is a separate table from "Employees" (see migration 0014) — every user IS an
 * employee, but not every employee is a user. This page only ever grants/edits/revokes
 * access for an EXISTING employee; it can't create a new employee from here (that's what
 * the Employees page is for). Granting/revoking still goes through the same
 * employees.pin_hash mechanism the Employees page uses — see /api/users' comment for why —
 * so there's exactly one source of truth for who can actually log in.
 */
export function UsersClient({ canManage }: { canManage: boolean }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [fEmployeeId, setFEmployeeId] = useState("");
  const [fRole, setFRole] = useState("");
  const [fPin, setFPin] = useState("");
  const [fError, setFError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError("");
    const [uRes, eRes, rRes] = await Promise.all([
      fetchJson<{ users: UserRow[] }>("/api/users"),
      fetchJson<{ employees: Employee[] }>("/api/employees"),
      fetchJson<{ roles: RoleOption[] }>("/api/roles"),
    ]);
    if (!uRes.ok) setLoadError(uRes.error);
    setUsers(uRes.data?.users ?? []);
    setEmployees(eRes.data?.employees ?? []);
    setRoles(rRes.data?.roles ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // Employees who can be turned into a new user — active roster entries who aren't already one.
  const availableEmployees = employees.filter((e) => e.status === "active" && !e.is_user);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = [u.employees?.name ?? "", u.employees?.role ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search]);

  function openAdd() {
    setEditingUserId(null);
    setFEmployeeId(availableEmployees[0]?.id ?? "");
    setFRole(availableEmployees[0]?.role ?? roles[0]?.name ?? "");
    setFPin("");
    setFError("");
    setFormOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditingUserId(u.employee_id);
    setFEmployeeId(u.employee_id);
    setFRole(u.employees?.role ?? roles[0]?.name ?? "");
    setFPin("");
    setFError("");
    setFormOpen(true);
  }

  async function save() {
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
    setSaving(true);
    setFError("");
    const row: Record<string, unknown> = { id: fEmployeeId, role: fRole };
    if (fPin) row.pin = fPin;
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row }),
    });
    setSaving(false);
    if (!res.ok) {
      setFError((await res.json()).error ?? "Could not save");
      return;
    }
    setFormOpen(false);
    await load();
  }

  async function revoke(u: UserRow) {
    if (!confirm(`Revoke login access for ${u.employees?.name ?? "this user"}? They'll stay on the employee roster.`)) return;
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "revokeUser", row: { id: u.employee_id } }),
    });
    if (res.ok) await load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or role…"
            className={searchInputCls}
          />
        </div>
        {canManage && (
          <button onClick={openAdd} disabled={availableEmployees.length === 0} className={`${addBtnCls} ml-auto disabled:opacity-40`} title={availableEmployees.length === 0 ? "Every active employee already has a user account" : undefined}>
            + Add User
          </button>
        )}
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-sm text-crimson-400">
          Couldn&apos;t load users: {loadError}
        </p>
      )}

      <Panel loading={loading}>
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
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <Td className="font-medium text-ink-strong">{u.employees?.name ?? "—"}</Td>
                  <Td className="text-ink-mid capitalize">{u.employees?.role ?? "—"}</Td>
                  <Td>
                    <Badge tone={u.is_active ? "basil" : "steel"}>{u.is_active ? "Active" : "Revoked"}</Badge>
                  </Td>
                  <Td className="text-ink-mid">{u.created_at.slice(0, 10)}</Td>
                  <Td>
                    {canManage && (
                      <div className="flex gap-1.5">
                        <IconBtn title="Edit (change PIN or role)" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        {u.is_active && (
                          <IconBtn title="Revoke access" onClick={() => revoke(u)}>
                            <UserX className="h-3.5 w-3.5" />
                          </IconBtn>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <EmptyRow colSpan={5} label={search ? "No users match that search." : "No users yet — add one from an existing employee."} />
              )}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Modal
        busy={saving}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingUserId ? "Edit user" : "Add user"}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
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
            {roles.map((r) => (
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
