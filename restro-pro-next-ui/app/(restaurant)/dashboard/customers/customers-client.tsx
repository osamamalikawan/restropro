"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Area = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; address: string | null; area_id: string | null; delivery_areas?: { name: string } | null };

export function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [areaId, setAreaId] = useState("");
  const [error, setError] = useState("");

  async function load(query = "") {
    const res = await fetch(`/api/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    if (res.ok) setCustomers(data.customers ?? []);
  }
  useEffect(() => {
    load();
    fetch("/api/delivery-areas").then((r) => r.json()).then((d) => setAreas(d.areas ?? []));
  }, []);

  async function addCustomer() {
    if (!name.trim() || !phone.trim()) return;
    setError("");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "insert",
        row: { name: name.trim(), phone: phone.trim(), address: address.trim() || null, area_id: areaId || null },
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setName("");
    setPhone("");
    setAddress("");
    setAreaId("");
    load(q);
  }
  async function removeCustomer(id: string) {
    await fetch("/api/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "delete", row: { id } }) });
    load(q);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Customers</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          load(e.target.value);
        }}
        placeholder="Search by name or phone…"
        className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm mb-4"
      />

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/50 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-left p-3">Address</th>
              <th className="text-left p-3">Area</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-neutral-800">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-neutral-400">{c.phone}</td>
                <td className="p-3 text-neutral-400">{c.address ?? "—"}</td>
                <td className="p-3 text-neutral-400">{c.delivery_areas?.name ?? "—"}</td>
                <td className="p-3">
                  <button onClick={() => removeCustomer(c.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-neutral-500">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="font-display font-semibold mb-3">Add customer</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (unique)" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button onClick={addCustomer} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2">
          Add customer
        </button>
      </div>
    </main>
  );
}
