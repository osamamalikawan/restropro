"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { inputCls, btnPrimary } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow } from "@/components/ui/panel";
import { fmtMoney } from "@/lib/format";

type Product = { id: string; name: string };
type InventoryItem = { id: string; name: string; unit: string; cost: number; item_type: "ready_made" | "self_made" };
type RecipeLine = { inventory_item_id: string; quantity: number; inventory_items?: { name: string; unit: string; cost: number } | null };
type ProdRecipeLine = { ingredient_item_id: string; quantity: number; ingredient?: { name: string; unit: string; cost: number } | null };
type Production = {
  id: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  produced_at: string;
  inventory_items?: { name: string; unit: string } | null;
  employees?: { name: string } | null;
};

const TABS = [
  { id: "product", label: "Product Recipes" },
  { id: "selfmade", label: "Self-Made Recipes" },
  { id: "history", label: "Production History" },
] as const;

export function RecipesProductionClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("product");
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/inventory").then((r) => r.json()), fetch("/api/productions").then((r) => r.json())]).then(
      ([p, i, pr]) => {
        setProducts(p.products ?? []);
        setInventoryItems(i.inventoryItems ?? []);
        setProductions(pr.productions ?? []);
      }
    );
  }, []);

  useEffect(() => {
    const requested = searchParams.get("productId");
    if (requested) setTab("product");
  }, [searchParams]);

  const rawItems = inventoryItems.filter((i) => i.item_type === "ready_made");
  const selfMadeItems = inventoryItems.filter((i) => i.item_type === "self_made");

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id ? "border-chili-500 text-ink-strong" : "border-transparent text-ink-mid hover:text-ink-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "product" && <ProductRecipesTab products={products} rawItems={rawItems} initialProductId={searchParams.get("productId")} />}
      {tab === "selfmade" && <SelfMadeRecipesTab selfMadeItems={selfMadeItems} rawItems={rawItems} />}
      {tab === "history" && <HistoryTab productions={productions} />}
    </main>
  );
}

function ProductRecipesTab({ products, rawItems, initialProductId }: { products: Product[]; rawItems: InventoryItem[]; initialProductId: string | null }) {
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? "");
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!productId && products[0]) setProductId(products[0].id);
  }, [products, productId]);

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/recipes?productId=${productId}`)
      .then((r) => r.json())
      .then((d) => setLines(d.recipeItems ?? []));
  }, [productId]);

  const costPerUnit = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.inventory_items?.cost ?? 0), 0);

  function addRow() {
    if (!newItemId || !newQty) return;
    const item = rawItems.find((i) => i.id === newItemId);
    if (!item) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.inventory_item_id === newItemId);
      const line = { inventory_item_id: newItemId, quantity: Number(newQty), inventory_items: { name: item.name, unit: item.unit, cost: item.cost } };
      if (existing) return prev.map((l) => (l.inventory_item_id === newItemId ? line : l));
      return [...prev, line];
    });
    setNewItemId("");
    setNewQty("1");
  }
  function removeRow(id: string) {
    setLines((prev) => prev.filter((l) => l.inventory_item_id !== id));
  }
  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, items: lines.map((l) => ({ inventoryItemId: l.inventory_item_id, quantity: l.quantity })) }),
    });
    setSaving(false);
    if (!res.ok) setError((await res.json()).error);
  }

  return (
    <Panel>
      <PanelHead title="Recipes (menu items)" subtitle="Ingredients consumed per menu item — stock deducts automatically on sale" />
      <div className="p-5 space-y-4">
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-mid">Menu item</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          {lines.map((l) => (
            <div key={l.inventory_item_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span>
                {l.inventory_items?.name} <span className="text-ink-faint">× {l.quantity} {l.inventory_items?.unit}</span>
              </span>
              <button onClick={() => removeRow(l.inventory_item_id)} className="text-ink-faint hover:text-crimson-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-sm text-ink-faint">No ingredients yet.</p>}
        </div>

        <div className="grid grid-cols-[1fr_110px_40px] gap-2">
          <select value={newItemId} onChange={(e) => setNewItemId(e.target.value)} className={inputCls}>
            <option value="">Choose ingredient…</option>
            {rawItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          <input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="number" step="0.01" className={inputCls} placeholder="Qty" />
          <button onClick={addRow} className="rounded-md bg-raised hover:bg-hover text-sm font-semibold">
            +
          </button>
        </div>

        <p className="text-xs text-ink-mid">Computed cost price: {fmtMoney(costPerUnit)}</p>
        <button onClick={save} disabled={saving || !productId} className={btnPrimary}>
          {saving ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </Panel>
  );
}

function SelfMadeRecipesTab({ selfMadeItems, rawItems }: { selfMadeItems: InventoryItem[]; rawItems: InventoryItem[] }) {
  const [itemId, setItemId] = useState(selfMadeItems[0]?.id ?? "");
  const [lines, setLines] = useState<ProdRecipeLine[]>([]);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!itemId && selfMadeItems[0]) setItemId(selfMadeItems[0].id);
  }, [selfMadeItems, itemId]);

  useEffect(() => {
    if (!itemId) return;
    fetch(`/api/production-recipes?itemId=${itemId}`)
      .then((r) => r.json())
      .then((d) => setLines(d.recipeItems ?? []));
  }, [itemId]);

  const costPerUnit = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.ingredient?.cost ?? 0), 0);

  function addRow() {
    if (!newIngredientId || !newQty) return;
    const item = rawItems.find((i) => i.id === newIngredientId);
    if (!item) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.ingredient_item_id === newIngredientId);
      const line = { ingredient_item_id: newIngredientId, quantity: Number(newQty), ingredient: { name: item.name, unit: item.unit, cost: item.cost } };
      if (existing) return prev.map((l) => (l.ingredient_item_id === newIngredientId ? line : l));
      return [...prev, line];
    });
    setNewIngredientId("");
    setNewQty("1");
  }
  function removeRow(id: string) {
    setLines((prev) => prev.filter((l) => l.ingredient_item_id !== id));
  }
  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/production-recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, items: lines.map((l) => ({ ingredientItemId: l.ingredient_item_id, quantity: l.quantity })) }),
    });
    setSaving(false);
    if (!res.ok) setError((await res.json()).error);
  }

  if (selfMadeItems.length === 0) {
    return (
      <Panel>
        <PanelHead title="Self-made item recipes" subtitle="Raw ingredients for in-house items — their cost is calculated automatically" />
        <p className="p-5 text-sm text-ink-faint">
          No self-made items yet — mark an item as "Self Made" on the Inventory page first.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead title="Self-made item recipes" subtitle="Raw ingredients for in-house items — their cost is calculated automatically" />
      <div className="p-5 space-y-4">
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-mid">Self-made item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
            {selfMadeItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          {lines.map((l) => (
            <div key={l.ingredient_item_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span>
                {l.ingredient?.name} <span className="text-ink-faint">× {l.quantity} {l.ingredient?.unit}</span>
              </span>
              <button onClick={() => removeRow(l.ingredient_item_id)} className="text-ink-faint hover:text-crimson-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-sm text-ink-faint">No ingredients yet.</p>}
        </div>

        <div className="grid grid-cols-[1fr_110px_40px] gap-2">
          <select value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)} className={inputCls}>
            <option value="">Choose ingredient…</option>
            {rawItems
              .filter((i) => i.id !== itemId)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
          </select>
          <input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="number" step="0.01" className={inputCls} placeholder="Qty" />
          <button onClick={addRow} className="rounded-md bg-raised hover:bg-hover text-sm font-semibold">
            +
          </button>
        </div>

        <p className="text-xs text-ink-mid">Computed cost per unit: {fmtMoney(costPerUnit)}</p>
        <button onClick={save} disabled={saving || !itemId} className={btnPrimary}>
          {saving ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </Panel>
  );
}

function HistoryTab({ productions }: { productions: Production[] }) {
  return (
    <Panel>
      <PanelHead title="Production history" subtitle="Self-made batches produced via the Restock page" />
      <TableScroll>
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Qty produced</Th>
              <Th>Cost/unit</Th>
              <Th>Total cost</Th>
              <Th>Logged by</Th>
            </tr>
          </thead>
          <tbody>
            {productions.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <Td className="text-ink-mid">{p.produced_at}</Td>
                <Td className="font-medium text-ink-strong">{p.inventory_items?.name ?? "—"}</Td>
                <Td>
                  {p.quantity} {p.inventory_items?.unit}
                </Td>
                <Td className="font-mono">{fmtMoney(p.cost_per_unit)}</Td>
                <Td className="font-mono font-medium">{fmtMoney(p.total_cost)}</Td>
                <Td className="text-ink-mid">{p.employees?.name ?? "—"}</Td>
              </tr>
            ))}
            {productions.length === 0 && <EmptyRow colSpan={6} label="No production history yet." />}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
