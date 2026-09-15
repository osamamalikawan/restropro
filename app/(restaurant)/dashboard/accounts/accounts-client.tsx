"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type AccountEntry = { id: string; txn_date: string; description: string; category: string; type: "income" | "expense"; amount: number };

export function AccountsClient() {
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    if (res.ok) setEntries(data.accounts ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);

  async function addEntry() {
    if (!description.trim() || !amount) return;
    setError("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: description.trim(), category: category.trim() || undefined, type, amount: Number(amount) }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setDescription("");
    setCategory("");
    setAmount("");
    load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Accounts</h1>
        <Link href="/dashboard" className="text-xs text-ink-mid underline hover:text-ink-strong">
          ← Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-xs text-ink-faint uppercase">Income</div>
          <div className="text-basil-400 font-semibold text-lg">Rs {income}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-xs text-ink-faint uppercase">Expense</div>
          <div className="text-crimson-400 font-semibold text-lg">Rs {expense}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-xs text-ink-faint uppercase">Net</div>
          <div className="font-semibold text-lg">Rs {income - expense}</div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Description</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3 text-ink-mid">{e.txn_date}</td>
                <td className="p-3">{e.description}</td>
                <td className="p-3 text-ink-mid">{e.category}</td>
                <td className={`p-3 font-mono ${e.type === "income" ? "text-basil-400" : "text-crimson-400"}`}>
                  {e.type === "income" ? "+" : "-"}Rs {e.amount}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-faint">
                  No ledger entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display font-semibold mb-3">Add entry</h2>
        {error && <p className="text-crimson-400 text-sm mb-2">{error}</p>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={type} onChange={(e) => setType(e.target.value as "income" | "expense")} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" type="number" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
        </div>
        <button onClick={addEntry} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2">
          Add entry
        </button>
      </div>
    </main>
  );
}
