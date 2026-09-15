"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type InventoryItem = { id: string; name: string; unit: string };
type Supplier = { id: string; name: string };
type Purchase = {
  id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  purchased_at: string;
  inventory_items?: { name: string; unit: string } | null;
  suppliers?: { name: string } | null;
};

export function RestockClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [invRes, supRes, purRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/suppliers"),
      fetch("/api/restock"),
    ]);
    const invData = await invRes.json();
    const supData = await supRes.json();
    const purData = await purRes.json();
    if (invRes.ok) setItems(invData.inventoryItems ?? []);
    if (supRes.ok) setSuppliers(supData.suppliers ?? []);
    if (purRes.ok) setPurchases(purData.purchases ?? []);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function logPurchase() {
    if (!itemId || !quantity || !unitCost) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/restock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inventoryItemId: itemId, supplierId: supplierId || null, quantity: Number(quantity), unitCost: Number(unitCost) }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setQuantity("1");
    setUnitCost("0");
    loadAll();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Restock</h1>
        <Link href="/dashboard" className="text-xs text-ink-mid underline hover:text-ink-strong">
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5 mb-6">
        <h2 className="font-display font-semibold mb-3">Log a purchase</h2>
        {error && <p className="text-crimson-400 text-sm mb-2">{error}</p>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option value="">Choose item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-md bg-raised border border-line px-3 py-2 text-sm">
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" placeholder="Quantity received" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
          <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} type="number" placeholder="Cost per unit" className="rounded-md bg-raised border border-line px-3 py-2 text-sm" />
        </div>
        <button onClick={logPurchase} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {saving ? "Saving…" : "Log purchase"}
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Item</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-left p-3">Qty</th>
              <th className="text-left p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3 text-ink-mid">{p.purchased_at}</td>
                <td className="p-3 font-medium">{p.inventory_items?.name}</td>
                <td className="p-3 text-ink-mid">{p.suppliers?.name ?? "—"}</td>
                <td className="p-3">
                  {p.quantity} {p.inventory_items?.unit}
                </td>
                <td className="p-3 font-mono">Rs {p.total_cost}</td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-faint">
                  No restock history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
