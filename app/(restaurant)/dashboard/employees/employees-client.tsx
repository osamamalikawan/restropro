"use client";
import { useEffect, useState } from "react";
import { IdCard, Pencil, ArrowLeft } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Avatar, Badge, IconBtn, KpiCard, addBtnCls } from "@/components/ui/panel";
import { fmtMoney } from "@/lib/format";

type Employee = { id: string; name: string; role: "admin" | "manager" | "cashier" | "inventory"; status: "active" | "inactive" };
type LedgerEntry = { id: string; employee_id: string; type: string; amount: number; note: string | null; txn_date: string };
type Sale = { cashier_employee_id: string | null; status: string };

const ROLE_COLORS: Record<string, string> = { admin: "crimson", manager: "turmeric", cashier: "basil", inventory: "steel" };
const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", cashier: "Cashier", inventory: "Inventory" };

export function EmployeesClient({ canManage }: { canManage: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fRole, setFRole] = useState<Employee["role"]>("cashier");
  const [fStatus, setFStatus] = useState<Employee["status"]>("active");
  const [fPin, setFPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [profileId, setProfileId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    const [eRes, lRes, sRes] = await Promise.all([fetch("/api/employees"), fetch("/api/employee-ledger?limit=1000"), fetch("/api/sales?limit=1000")]);
    const [e, l, s] = await Promise.all([eRes.json(), lRes.json(), sRes.json()]);
    if (!eRes.ok) {
      setLoadError(e.error || "Could not load employees");
      setEmployees([]);
    } else {
      setEmployees(e.employees ?? []);
    }
    setLedger(l.entries ?? []);
    setSales(s.sales ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFRole("cashier");
    setFStatus("active");
    setFPin("");
    setError("");
    setModalOpen(true);
  }
  function openEdit(e: Employee) {
    setEditingId(e.id);
    setFName(e.name);
    setFRole(e.role);
    setFStatus(e.status);
    setFPin("");
    setError("");
    setModalOpen(true);
  }
  async function save() {
    if (!fName.trim()) {
      setError("Name is required");
      return;
    }
    if (!editingId && !/^\d{4}$/.test(fPin)) {
      setError("A 4-digit PIN is required for a new employee");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: { id: editingId ?? undefined, name: fName.trim(), role: fRole, status: fStatus, pin: fPin || undefined },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save employee");
      return;
    }
    setModalOpen(false);
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
              <Badge tone={ROLE_COLORS[profile.role] as any}>{ROLE_LABELS[profile.role]}</Badge>
              <Badge tone={profile.status === "active" ? "basil" : "steel"}>{profile.status === "active" ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
          {canManage && (
            <button onClick={() => openEdit(profile)} className={`${btnGhost} ml-auto`}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

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
        <Field label="Role">
          <select value={fRole} onChange={(e) => setFRole(e.target.value as Employee["role"])} className={inputCls}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="inventory">Inventory</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value as Employee["status"])} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label={editingId ? "New 4-digit PIN (leave blank to keep current)" : "4-digit PIN"}>
          <input value={fPin} onChange={(e) => setFPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className={inputCls} placeholder="••••" inputMode="numeric" />
        </Field>
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
        <PanelHead title="Employees" subtitle="Staff who can sign in with a PIN">
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
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar id={e.id} name={e.name} />
                      <span className="font-medium text-ink-strong">{e.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={ROLE_COLORS[e.role] as any}>{ROLE_LABELS[e.role]}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={e.status === "active" ? "basil" : "steel"}>{e.status === "active" ? "Active" : "Inactive"}</Badge>
                  </Td>
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
                    </div>
                  </Td>
                </tr>
              ))}
              {!loading && employees.length === 0 && <EmptyRow colSpan={4} label="No employees yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {renderModal()}
    </main>
  );
}
