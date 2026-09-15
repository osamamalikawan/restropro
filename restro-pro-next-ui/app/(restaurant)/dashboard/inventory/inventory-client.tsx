"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type InventoryItem = { id: string; name: string; unit: string; current_stock: number; min_stock: number; cost: number };

export function InventoryClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [cost, setCost] = useState("0");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/inventory");
    const data = await res.json();
    if (res.ok) setItems(data.inventoryItems ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function addItem() {
    if (!name.trim()) return;
    setError("");
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "insert",
        row: { name: name.trim(), unit, current_stock: Number(stock), min_stock: Number(minStock), cost: Number(cost) },
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setName("");
    setStock("0");
    setMinStock("0");
    setCost("0");
    load();
  }
  async function removeItem(id: string) {
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    load();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Inventory</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/50 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Item</th>
              <th className="text-left p-3">Stock</th>
              <th className="text-left p-3">Min</th>
              <th className="text-left p-3">Cost</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const low = i.current_stock <= i.min_stock;
              return (
                <tr key={i.id} className="border-t border-neutral-800">
                  <td className="p-3 font-medium">{i.name}</td>
                  <td className={`p-3 ${low ? "text-crimson-400 font-semibold" : ""}`}>
                    {i.current_stock} {i.unit}
                  </td>
                  <td className="p-3 text-neutral-500">{i.min_stock}</td>
                  <td className="p-3 text-neutral-400">Rs {i.cost}</td>
                  <td className="p-3">
                    <button onClick={() => removeItem(i.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-neutral-500">
                  No inventory items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="font-display font-semibold mb-3">Add item</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm md:col-span-2" />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
            <option>pcs</option>
            <option>kg</option>
            <option>litre</option>
            <option>box</option>
          </select>
          <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock" type="number" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="Min stock" type="number" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost/unit" type="number" className="rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
        </div>
        <button onClick={addItem} className="mt-3 rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2">
          Add item
        </button>
      </div>
    </main>
  );
}
