"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Supplier = { id: string; name: string; contact_person: string | null; phone: string | null; category: string | null; payment_terms: string | null };

export function SuppliersClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [terms, setTerms] = useState("Net 15");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    if (res.ok) setSuppliers(data.suppliers ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function addSupplier() {
    if (!name.trim()) return;
    setError("");
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "insert",
        row: { name: name.trim(), contact_person: contact.trim() || null, phone: phone.trim() || null, category: category.trim() || null, payment_terms: terms },
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setName("");
    setContact("");
    setPhone("");
    setCategory("");
    load();
  }
  async function removeSupplier(id: string) {
    await fetch("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Suppliers</h1>
        <Link href="/dashboard" className="text-xs text-ink-mid underline hover:text-ink-strong">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="rounded-xl border border-line bg-surface overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Supplier</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Terms</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-ink-mid">
                  {s.contact_person}
                  {s.phone ? <div className="text-xs text-ink-faint">{s.phone}</div> : null}
                </td>
                <td className="p-3 text-ink-mid">{s.category}</td>
                <td className="p-3 text-ink-mid">{s.payment_terms}</td>
                <td className="p-3">
                  <button onClick={() => removeSupplier(s.id)} className="text-ink-faint hover:text-crimson-400 text-xs">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-faint">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display font-semibold mb-3">Add supplier</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact person" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <select value={terms} onChange={(e) => setTerms(e.target.value)} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option>Net 7</option>
            <option>Net 15</option>
            <option>Net 30</option>
            <option>Cash on delivery</option>
          </select>
        </div>
        <button onClick={addSupplier} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2">
          Add supplier
        </button>
      </div>
    </main>
  );
}
