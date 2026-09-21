"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow } from "@/components/ui/panel";
import { Field, inputCls, btnPrimary } from "@/components/ui/modal";
import { fmtMoney, todayISO } from "@/lib/format";

type InventoryItem = { id: string; name: string; unit: string; item_type: "ready_made" | "self_made"; cost: number };
type Supplier = { id: string; name: string };
type Purchase = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  purchased_at: string;
  inventory_items?: { name: string; unit: string } | null;
  suppliers?: { name: string } | null;
};
type Production = {
  id: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  produced_at: string;
  inventory_items?: { name: string; unit: string } | null;
  employees?: { name: string } | null;
};

export function RestockClient() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [invRes, supRes, purRes, prodRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/suppliers"),
      fetch("/api/restock?limit=1000"),
      fetch("/api/productions"),
    ]);
    const [invData, supData, purData, prodData] = await Promise.all([invRes.json(), supRes.json(), purRes.json(), prodRes.json()]);
    setItems(invData.inventoryItems ?? []);
    setSuppliers(supData.suppliers ?? []);
    setPurchases(purData.purchases ?? []);
    setProductions(prodData.productions ?? []);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  // Pre-select an item when arriving from Inventory's restock/production icon.
  useEffect(() => {
    const requested = searchParams.get("itemId");
    if (requested && items.some((i) => i.id === requested)) setItemId(requested);
    else if (!itemId && items.length > 0) setItemId(items[0].id);
  }, [items, searchParams]);

  const selectedItem = items.find((i) => i.id === itemId);
  const isSelf = selectedItem?.item_type === "self_made";

  useEffect(() => {
    if (isSelf && selectedItem) setUnitCost(String(selectedItem.cost));
  }, [isSelf, selectedItem]);

  async function submit() {
    if (!itemId || !quantity || Number(quantity) <= 0) {
      setError("Choose an item and enter a valid quantity");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(isSelf ? "/api/productions" : "/api/restock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isSelf
          ? { inventoryItemId: itemId, quantity: Number(quantity) }
          : { inventoryItemId: itemId, supplierId: supplierId || null, quantity: Number(quantity), unitCost: Number(unitCost) }
      ),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not log this");
      return;
    }
    setQuantity("1");
    await loadAll();
  }

  // Merge purchases + productions into one newest-first history, matching the prototype's
  // combined stockTransactions table.
  const history = useMemo(() => {
    const a = purchases.map((p) => ({
      id: `p-${p.id}`,
      date: p.purchased_at,
      item: p.inventory_items?.name ?? "—",
      unit: p.inventory_items?.unit ?? "",
      source: p.suppliers?.name ?? "—",
      qty: p.quantity,
      cost: p.unit_cost,
      total: p.total_cost,
      by: null as string | null,
    }));
    const b = productions.map((p) => ({
      id: `pr-${p.id}`,
      date: p.produced_at,
      item: p.inventory_items?.name ?? "—",
      unit: p.inventory_items?.unit ?? "",
      source: "Production (in-house)",
      qty: p.quantity,
      cost: p.cost_per_unit,
      total: p.total_cost,
      by: p.employees?.name ?? null,
    }));
    return [...a, ...b].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 30);
  }, [purchases, productions]);

  const total = (Number(quantity) || 0) * (Number(unitCost) || 0);

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold">{isSelf ? "Log production" : "Log a purchase"}</h3>
          <p className="text-xs text-ink-mid mb-4">{isSelf ? "Add in-house prepared stock" : "Restocks from a linked supplier"}</p>

          {error && <p className="mb-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}

          <div className="space-y-3">
            <Field label="Item">
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.item_type === "self_made" ? "Self Made" : "Ready Made"})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            {!isSelf && (
              <Field label="Supplier">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
                  <option value="">No supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={isSelf ? "Quantity produced" : "Quantity received"}>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
            </Field>
            <Field label={isSelf ? "Cost / unit (computed from recipe)" : "Cost / unit (Rs)"}>
              <input
                value={unitCost}
                disabled={isSelf}
                onChange={(e) => setUnitCost(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className={`${inputCls} disabled:opacity-60`}
              />
            </Field>
            <p className="text-xs text-ink-mid">Total: {fmtMoney(total)}</p>
            <button onClick={submit} disabled={saving} className={`${btnPrimary} w-full justify-center`}>
              {saving ? "Saving…" : isSelf ? "+ Log production" : "+ Add stock"}
            </button>
          </div>
        </div>

        <Panel loading={loading}>
          <PanelHead title="Restock history" subtitle="Purchases and in-house production, newest first" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Date</Th>
                  <Th>Item</Th>
                  <Th>Source</Th>
                  <Th>Qty</Th>
                  <Th>Cost/unit</Th>
                  <Th>Total</Th>
                  <Th>Logged by</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <Td className="text-ink-mid">{h.date}</Td>
                    <Td className="font-medium text-ink-strong">{h.item}</Td>
                    <Td className="text-ink-mid">{h.source}</Td>
                    <Td>
                      {h.qty} {h.unit}
                    </Td>
                    <Td className="font-mono">{fmtMoney(h.cost)}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(h.total)}</Td>
                    <Td className="text-ink-mid">{h.by ?? "—"}</Td>
                  </tr>
                ))}
                {history.length === 0 && <EmptyRow colSpan={7} label="No restock history yet." />}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      </div>
    </main>
  );
}
