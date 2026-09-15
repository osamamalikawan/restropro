"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Supplier = { id: string; name: string };
type Entry = { id: string; amount: number; method: string; note: string | null; txn_date: string; suppliers?: { name: string } | null };

export function SupplierLedgerClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [supRes, entryRes] = await Promise.all([fetch("/api/suppliers"), fetch("/api/supplier-ledger")]);
    const supData = await supRes.json();
    const entryData = await entryRes.json();
    if (supRes.ok) setSuppliers(supData.suppliers ?? []);
    if (entryRes.ok) setEntries(entryData.entries ?? []);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function logPayment() {
    if (!supplierId || !amount) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/supplier-ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplierId, amount: Number(amount), method, note: note.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setAmount("");
    setNote("");
    loadAll();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Supplier Ledger</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 mb-6">
        <h2 className="font-display font-semibold mb-3">Log payment</h2>
        {error && <p className="text-crimson-400 text-sm mb-2">{error}</p>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
            <option value="">Choose supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
            <option>Cash</option>
            <option>Card</option>
            <option>Bank Transfer</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
        </div>
        <button onClick={logPayment} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {saving ? "Saving…" : "Log payment"}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/50 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-left p-3">Method</th>
              <th className="text-left p-3">Amount</th>
              <th className="text-left p-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="p-3 text-neutral-400">{e.txn_date}</td>
                <td className="p-3 font-medium">{e.suppliers?.name}</td>
                <td className="p-3 text-neutral-400">{e.method}</td>
                <td className="p-3 font-mono">Rs {e.amount}</td>
                <td className="p-3 text-neutral-500">{e.note ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-neutral-500">
                  No payments logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
