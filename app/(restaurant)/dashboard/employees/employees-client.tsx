"use client";
import { useEffect, useState } from "react";

type Employee = { id: string; name: string; role: string; status: string };

const ROLES = ["admin", "manager", "cashier", "inventory"] as const;

/** Staff directory — matches the prototype's Employees view. Manager has view-only access
 *  (see the permission matrix's default: employees:{view:true} for Manager, no create/edit),
 *  so `canManage` (passed from the page's own admin check) hides the write controls for
 *  anyone who isn't Admin; /api/employees also independently rejects non-admin writes. */
export function EmployeesClient({ canManage }: { canManage: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("cashier");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/employees");
    const data = await res.json();
    if (res.ok) setEmployees(data.employees ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function changeRole(emp: Employee, newRole: string) {
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row: { id: emp.id, role: newRole } }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    load();
  }
  async function toggleStatus(emp: Employee) {
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row: { id: emp.id, status: emp.status === "active" ? "inactive" : "active" } }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    load();
  }

  async function addEmployee() {
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setError("Name and a 4-digit PIN are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name: name.trim(), role, status: "active", pin } }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setName("");
    setPin("");
    load();
  }

  return (
    <main className="p-6 md:p-8">
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="rounded-xl border border-line bg-surface overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3 font-medium">{e.name}</td>
                <td className="p-3">
                  {canManage ? (
                    <select
                      value={e.role}
                      onChange={(ev) => changeRole(e, ev.target.value)}
                      className="rounded-md bg-raised border border-line px-2 py-1 text-sm capitalize"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="capitalize">{e.role}</span>
                  )}
                </td>
                <td className="p-3">
                  {canManage ? (
                    <button
                      onClick={() => toggleStatus(e)}
                      className={`text-xs px-2 py-1 rounded-full ${e.status === "active" ? "bg-basil-500/20 text-basil-400" : "bg-raised text-ink-faint"}`}
                    >
                      {e.status}
                    </button>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full ${e.status === "active" ? "bg-basil-500/20 text-basil-400" : "bg-raised text-ink-faint"}`}>
                      {e.status}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-ink-faint">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display font-semibold mb-3 text-ink-strong">Add employee</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
            <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className="rounded-md bg-raised border border-line px-3 py-2 text-sm capitalize">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-digit PIN" maxLength={4} inputMode="numeric" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          </div>
          <button onClick={addEmployee} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
            {saving ? "Saving…" : "Add employee"}
          </button>
        </div>
      )}
    </main>
  );
}
