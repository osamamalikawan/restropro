"use client";
import { useEffect, useState } from "react";

type Expense = {
  id: string;
  category: string;
  expense_type: "regular" | "recurring";
  amount: number;
  vendor: string | null;
  description: string | null;
  payment_method: string;
  txn_date: string;
};

export function ExpensesClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [expenseType, setExpenseType] = useState<"regular" | "recurring">("regular");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/expenses");
    const data = await res.json();
    if (res.ok) setExpenses(data.expenses ?? []);
  }
  useEffect(() => {
    load();
    (async () => {
      const res = await fetch("/api/expense-categories");
      const data = await res.json();
      if (res.ok) {
        const names = (data.categories ?? []).map((c: { name: string }) => c.name);
        setCategories(names);
        setCategory((prev) => prev || names[0] || "");
      }
    })();
  }, []);

  const totalThisList = expenses.reduce((s, e) => s + e.amount, 0);

  async function addExpense() {
    if (!category || !amount) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category,
        expenseType,
        amount: Number(amount),
        vendor: vendor.trim() || undefined,
        description: description.trim() || undefined,
        paymentMethod,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setAmount("");
    setVendor("");
    setDescription("");
    load();
  }

  return (
    <main className="p-6 md:p-8 max-w-3xl">
      <div className="rounded-xl border border-line bg-surface p-4 mb-6">
        <div className="text-xs text-ink-faint uppercase">Total (last 50 entries)</div>
        <div className="text-crimson-400 font-semibold text-lg">Rs {totalThisList}</div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5 mb-6">
        <h2 className="font-display font-semibold mb-3">Log expense</h2>
        {error && <p className="text-crimson-400 text-sm mb-2">{error}</p>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={expenseType} onChange={(e) => setExpenseType(e.target.value as "regular" | "recurring")} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option value="regular">Regular</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option>Cash</option>
            <option>Card</option>
            <option>Bank Transfer</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
        </div>
        <button onClick={addExpense} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {saving ? "Saving…" : "Log expense"}
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Vendor</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3 text-ink-mid">{e.txn_date}</td>
                <td className="p-3 font-medium">
                  {e.category}
                  {e.description ? <div className="text-xs text-ink-faint">{e.description}</div> : null}
                </td>
                <td className="p-3 text-ink-mid">{e.vendor ?? "—"}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${e.expense_type === "recurring" ? "bg-turmeric-500/20 text-turmeric-400" : "bg-raised text-ink-faint"}`}>
                    {e.expense_type}
                  </span>
                </td>
                <td className="p-3 font-mono text-crimson-400">Rs {e.amount}</td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-faint">
                  No expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
