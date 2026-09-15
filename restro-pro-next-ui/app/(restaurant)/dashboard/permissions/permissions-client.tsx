"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Employee = { id: string; name: string; role: string; status: string };

const ROLES = ["admin", "manager", "cashier", "inventory"] as const;

// Static reference — this codebase enforces these via a hardcoded allow-list check in each
// app/api/<module>/route.ts, not a dynamic permissions table (see the "Users & Permissions UI"
// section of the porting prompt in README.md for why that's a deliberate scoping choice).
const ROLE_ACCESS: Record<string, string[]> = {
  admin: ["Everything, including Settings and this page"],
  manager: ["POS", "Menu", "Inventory", "Suppliers", "Restock", "Accounts", "Customers", "Employee/Supplier Ledger", "Expenses", "Tables & Delivery"],
  cashier: ["POS", "Customers (search/add only)"],
  inventory: ["POS", "Inventory", "Restock", "Suppliers"],
};

export function PermissionsClient() {
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
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Users &amp; Permissions</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/50 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="p-3 font-medium">{e.name}</td>
                <td className="p-3">
                  <select
                    value={e.role}
                    onChange={(ev) => changeRole(e, ev.target.value)}
                    className="rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => toggleStatus(e)}
                    className={`text-xs px-2 py-1 rounded-full ${e.status === "active" ? "bg-basil-500/20 text-basil-400" : "bg-neutral-800 text-neutral-500"}`}
                  >
                    {e.status}
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-neutral-500">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 mb-6">
        <h2 className="font-display font-semibold mb-3">Add employee</h2>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-digit PIN" maxLength={4} inputMode="numeric" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
        </div>
        <button onClick={addEmployee} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {saving ? "Saving…" : "Add employee"}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="font-display font-semibold mb-3">What each role can access</h2>
        <div className="space-y-2 text-sm">
          {ROLES.map((r) => (
            <div key={r} className="flex gap-3">
              <span className="w-20 shrink-0 font-semibold capitalize">{r}</span>
              <span className="text-neutral-400">{ROLE_ACCESS[r].join(", ")}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
