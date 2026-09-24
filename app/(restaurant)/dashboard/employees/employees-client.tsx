"use client";
import { useEffect, useMemo, useState } from "react";
import { IdCard, Pencil, ArrowLeft, UserX, RotateCcw, Search } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Avatar, Badge, IconBtn, KpiCard, addBtnCls } from "@/components/ui/panel";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type Employee = {
  id: string;
  name: string;
  role: string;
  status: "active" | "inactive" | "suspended" | "left";
  father_name: string | null;
  cnic_number: string | null;
  address: string | null;
  joining_date: string | null;
  salary_amount: number | null;
  left_date: string | null;
  is_user: boolean;
};
type RoleOption = { id: string; name: string; is_system: boolean };
type LedgerEntry = { id: string; employee_id: string; type: string; amount: number; note: string | null; txn_date: string };
type Sale = { cashier_employee_id: string | null; status: string };

const ROLE_COLORS: Record<string, string> = { admin: "crimson", manager: "turmeric", cashier: "basil", inventory: "steel" };
/** Custom roles don't have a fixed color/casing — this falls back to a neutral badge with
 *  the role name title-cased, rather than only ever rendering the 4 system roles correctly. */
function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? "steel";
}
function roleLabel(role: string): string {
  return role.length ? role[0].toUpperCase() + role.slice(1) : role;
}

export function EmployeesClient({ canManage }: { canManage: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "left">("active");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fRole, setFRole] = useState("cashier");
  const [fFatherName, setFFatherName] = useState("");
  const [fCnic, setFCnic] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fJoiningDate, setFJoiningDate] = useState("");
  const [fSalary, setFSalary] = useState("");
  const [fPin, setFPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleError, setNewRoleError] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);

  async function loadRoles() {
    const res = await fetchJson<{ roles: RoleOption[] }>("/api/roles");
    if (res.ok) setRoles(res.data?.roles ?? []);
  }

  async function load() {
    setLoading(true);
    setLoadError("");
    // Independent per-endpoint fetches — see lib/fetch-json.ts — a failed/empty response from
    // one can't throw and wipe out the others.
    const [eRes, lRes, sRes] = await Promise.all([
      fetchJson<{ employees: Employee[] }>("/api/employees"),
      fetchJson<{ entries: LedgerEntry[] }>("/api/employee-ledger?limit=1000"),
      fetchJson<{ sales: Sale[] }>("/api/sales?limit=1000"),
    ]);
    if (!eRes.ok) {
      setLoadError(eRes.error);
      setEmployees([]);
    } else {
      setEmployees(eRes.data?.employees ?? []);
    }
    setLedger(lRes.ok ? lRes.data?.entries ?? [] : []);
    setSales(sRes.ok ? sRes.data?.sales ?? [] : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    loadRoles();
  }, []);

  const filtered = useMemo(() => {
    const byTab = employees.filter((e) => (tab === "left" ? e.status === "left" : e.status !== "left"));
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((e) => [e.name, e.role].join(" ").toLowerCase().includes(q));
  }, [employees, tab, search]);
  const leftCount = employees.filter((e) => e.status === "left").length;

  async function createRole() {
    const name = newRoleName.trim();
    if (!name) {
      setNewRoleError("Enter a role name");
      return;
    }
    setSavingRole(true);
    setNewRoleError("");
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", name }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingRole(false);
    if (!res.ok) {
      setNewRoleError(data.error ?? "Could not create role");
      return;
    }
    setNewRoleName("");
    setNewRoleOpen(false);
    await loadRoles();
    setFRole(name);
  }

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFRole("cashier");
    setFFatherName("");
    setFCnic("");
    setFAddress("");
    setFJoiningDate(new Date().toISOString().slice(0, 10));
    setFSalary("");
    setFPin("");
    setError("");
    setModalOpen(true);
  }
  function openEdit(e: Employee) {
    setEditingId(e.id);
    setFName(e.name);
    setFRole(e.role);
    setFFatherName(e.father_name ?? "");
    setFCnic(e.cnic_number ?? "");
    setFAddress(e.address ?? "");
    setFJoiningDate(e.joining_date ?? "");
    setFSalary(e.salary_amount != null ? String(e.salary_amount) : "");
    setFPin("");
    setError("");
    setModalOpen(true);
  }
  async function save() {
    if (!fName.trim()) {
      setError("Name is required");
      return;
    }
    if (fPin && !/^\d{4}$/.test(fPin)) {
      setError("PIN must be exactly 4 digits");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: {
          id: editingId ?? undefined,
          name: fName.trim(),
          role: fRole,
          father_name: fFatherName.trim() || null,
          cnic_number: fCnic.trim() || null,
          address: fAddress.trim() || null,
          joining_date: fJoiningDate || null,
          salary_amount: fSalary ? Number(fSalary) : null,
          pin: fPin || undefined,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({})))?.error ?? "Could not save employee");
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function markLeft(id: string) {
    if (!confirm("Mark this employee as left? Their record is kept, but login access (if any) is disabled immediately.")) return;
    setBusyId(id);
    const res = await fetchJson("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "markLeft", row: { id } }),
    });
    setBusyId(null);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    await load();
  }

  async function restore(id: string) {
    setBusyId(id);
    const res = await fetchJson("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row: { id, status: "active", left_date: null } }),
    });
    setBusyId(null);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    await load();
  }

  const profile = profileId ? employees.find((e) => e.id === profileId) : null;

  if (profile) {
    const payments = ledger.filter((l) => l.employee_id === profile.id);
    const totalPaid = payments.reduce((s, l) => s + Number(l.amount), 0);
    const ordersProcessed = sales.filter((s) => s.cashier_employee_id === profile.id && s.status !== "cancelled").length;

    return (
      <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
        <button onClick={() => setProfileId(null)} className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink-strong">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to employees
        </button>
        <div className="flex items-center gap-4 mb-6">
          <Avatar id={profile.id} name={profile.name} size={56} />
          <div>
            <h1 className="font-display text-2xl font-semibold">{profile.name}</h1>
            <div className="flex gap-2 mt-1">
              <Badge tone={roleColor(profile.role) as any}>{roleLabel(profile.role)}</Badge>
              {profile.status === "left" ? (
                <Badge tone="crimson">Left {profile.left_date ? `· ${profile.left_date}` : ""}</Badge>
              ) : (
                <Badge tone="basil">Active</Badge>
              )}
              <Badge tone={profile.is_user ? "basil" : "steel"}>{profile.is_user ? "User" : "Employee only"}</Badge>
            </div>
          </div>
          {canManage && (
            <button onClick={() => openEdit(profile)} className={`${btnGhost} ml-auto`}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-ink-mid mb-1">Father's name</div>
            <div className="text-sm font-medium text-ink-strong">{profile.father_name || "—"}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-ink-mid mb-1">CNIC</div>
            <div className="text-sm font-medium text-ink-strong font-mono">{profile.cnic_number || "—"}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-ink-mid mb-1">Joining date</div>
            <div className="text-sm font-medium text-ink-strong">{profile.joining_date || "—"}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-ink-mid mb-1">Salary</div>
            <div className="text-sm font-medium text-ink-strong">{profile.salary_amount != null ? fmtMoney(profile.salary_amount) : "—"}</div>
          </div>
        </div>
        {profile.address && (
          <div className="rounded-xl border border-line bg-surface p-4 mb-6">
            <div className="text-xs text-ink-mid mb-1">Address</div>
            <div className="text-sm text-ink-strong">{profile.address}</div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard label="Total paid" value={fmtMoney(totalPaid)} />
          <KpiCard label="Payments logged" value={payments.length} />
          <KpiCard label="Orders processed" value={ordersProcessed} />
        </div>

        <Panel loading={loading}>
          <PanelHead title="Payment history" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <Td className="text-ink-mid">{l.txn_date}</Td>
                    <Td>
                      <Badge>{l.type}</Badge>
                    </Td>
                    <Td className="font-mono font-medium">{fmtMoney(l.amount)}</Td>
                    <Td className="text-ink-mid">{l.note || "—"}</Td>
                  </tr>
                ))}
                {payments.length === 0 && <EmptyRow colSpan={4} label="No payments logged yet." />}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        {renderModal()}
      </main>
    );
  }

  function renderModal() {
    return (
      <Modal
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit employee" : "Add employee"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Father's name">
          <input value={fFatherName} onChange={(e) => setFFatherName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="CNIC number">
          <input value={fCnic} onChange={(e) => setFCnic(e.target.value)} className={inputCls} placeholder="xxxxx-xxxxxxx-x" />
        </Field>
        <Field label="Address">
          <input value={fAddress} onChange={(e) => setFAddress(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Joining date">
            <input type="date" value={fJoiningDate} onChange={(e) => setFJoiningDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Salary amount">
            <input value={fSalary} onChange={(e) => setFSalary(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Role">
          <div className="flex gap-2 items-center">
            <select value={fRole} onChange={(e) => setFRole(e.target.value)} className={inputCls}>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {roleLabel(r.name)}
                </option>
              ))}
            </select>
            {canManage && (
              <button type="button" onClick={() => setNewRoleOpen(true)} className="shrink-0 text-xs font-medium text-chili-500 hover:underline whitespace-nowrap">
                + New role
              </button>
            )}
          </div>
        </Field>
        <Field
          label={
            !editingId
              ? "4-digit PIN (optional — leave blank to add as roster-only, no login)"
              : employees.find((x) => x.id === editingId)?.is_user
                ? "New 4-digit PIN (leave blank to keep current)"
                : "Set a 4-digit PIN to grant login access"
          }
        >
          <input value={fPin} onChange={(e) => setFPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className={inputCls} placeholder="••••" inputMode="numeric" />
        </Field>
        <p className="text-xs text-ink-faint -mt-1">
          Every User is an employee, but not every employee is a User — only employees with a PIN can sign in to POS/Dashboard.
          PIN access can also be granted or removed later from Users &amp; Permissions.
        </p>
      </Modal>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      {loadError && (
        <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-sm text-crimson-400">
          Couldn't load employees: {loadError}
        </p>
      )}
      <Panel loading={loading}>
        <PanelHead title="Employees" subtitle="Full staff roster — mark someone left instead of deleting their record">
          <div className="relative min-w-[200px] mr-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or role…"
              className={`${inputCls} pl-8`}
            />
          </div>
          <div className="flex rounded-lg border border-line p-0.5 mr-1">
            <button
              onClick={() => setTab("active")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${tab === "active" ? "bg-raised text-ink-strong" : "text-ink-mid"}`}
            >
              Active
            </button>
            <button
              onClick={() => setTab("left")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${tab === "left" ? "bg-raised text-ink-strong" : "text-ink-mid"}`}
            >
              Left {leftCount > 0 && `(${leftCount})`}
            </button>
          </div>
          {canManage && (
            <button onClick={openAdd} className={addBtnCls}>
              + Add employee
            </button>
          )}
        </PanelHead>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>{tab === "left" ? "Left on" : "Joined"}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className={`border-b border-line last:border-0 ${e.status === "left" ? "opacity-60" : ""}`}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar id={e.id} name={e.name} />
                      <span className="font-medium text-ink-strong">{e.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={roleColor(e.role) as any}>{roleLabel(e.role)}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={e.is_user ? "basil" : "steel"}>{e.is_user ? "User" : "Employee only"}</Badge>
                  </Td>
                  <Td className="text-ink-mid">{tab === "left" ? e.left_date || "—" : e.joining_date || "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <IconBtn title="View profile" onClick={() => setProfileId(e.id)}>
                        <IdCard className="h-3.5 w-3.5" />
                      </IconBtn>
                      {canManage && (
                        <IconBtn title="Edit" onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      {canManage && e.status !== "left" && (
                        <IconBtn title="Mark as left" onClick={() => markLeft(e.id)}>
                          <UserX className={`h-3.5 w-3.5 ${busyId === e.id ? "opacity-50" : ""}`} />
                        </IconBtn>
                      )}
                      {canManage && e.status === "left" && (
                        <IconBtn title="Restore to active" onClick={() => restore(e.id)}>
                          <RotateCcw className={`h-3.5 w-3.5 ${busyId === e.id ? "opacity-50" : ""}`} />
                        </IconBtn>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {!loading && !loadError && filtered.length === 0 && (
                <EmptyRow colSpan={5} label={tab === "left" ? "No one has left yet." : "No employees yet — add one above."} />
              )}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {renderModal()}

      <Modal
        busy={savingRole}
        open={newRoleOpen}
        onClose={() => setNewRoleOpen(false)}
        title="New role"
        width="max-w-sm"
        footer={
          <>
            <button onClick={() => setNewRoleOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={createRole} disabled={savingRole} className={btnPrimary}>
              {savingRole ? "Creating…" : "Create role"}
            </button>
          </>
        }
      >
        {newRoleError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{newRoleError}</p>}
        <Field label="Role name">
          <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className={inputCls} placeholder="e.g. Head Chef" />
        </Field>
        <p className="text-xs text-ink-faint">
          New roles start with no module access. Open Users &amp; Permissions afterward to choose what this role can see.
        </p>
      </Modal>
    </main>
  );
}
