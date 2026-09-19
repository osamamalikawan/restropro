"use client";
import { useEffect, useState } from "react";

type Role = "admin" | "manager" | "cashier" | "inventory";
type Matrix = Record<Role, Record<string, boolean>>;
type Category = { id: string; name: string };

const ROLE_META: Record<Role, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#D9481F" },
  manager: { label: "Manager", color: "#3F6E52" },
  cashier: { label: "Cashier", color: "#4C7EA8" },
  inventory: { label: "Inventory Manager", color: "#C99A3E" },
};

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

/** Matches the prototype's view-admin ("Users & Permissions") 1:1: the role permission
 *  matrix (togglePerm() in the prototype), default shift timings (saveShift()), and
 *  expense categories (addExpenseCategory()/removeExpenseCategory()) — each panel backed by
 *  a real endpoint now (see lib/permissions.ts) instead of the prototype's in-memory tenant
 *  object, so toggling a cell here actually changes what that role can reach. */
export function PermissionsClient() {
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
      // revert on failure
      setMatrix((prev) => (prev ? { ...prev, [role]: { ...prev[role], [module]: !canView } } : prev));
      return;
    }
    setPermMsg(`Permission updated for ${ROLE_META[role].label}`);
    setTimeout(() => setPermMsg(""), 2000);
  }

  async function saveShift() {
    setShiftMsg("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shiftStart, shiftEnd }),
    });
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
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name } }),
    });
    const data = await res.json();
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
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4">
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">Role permissions</h3>
          <div className="text-xs text-ink-faint mt-0.5">
            Controls which modules each role can access. Admin always has full access.
          </div>
        </div>
        {permMsg && <p className="text-xs text-basil-400 mb-3">{permMsg}</p>}
        {!matrix ? (
          <p className="text-ink-faint text-sm">Loading…</p>
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
                        style={{ background: `${ROLE_META[role].color}22`, color: ROLE_META[role].color }}
                      >
                        {ROLE_META[role].label}
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

      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-line bg-surface p-6">
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
            className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            Save default shift
          </button>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6">
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
              className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
