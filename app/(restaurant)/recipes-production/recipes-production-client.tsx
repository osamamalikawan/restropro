"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { inputCls, btnPrimary } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow } from "@/components/ui/panel";
import { PageLoader } from "@/components/ui/loading";
import { SearchSelect } from "@/components/ui/search-select";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type Product = { id: string; name: string; is_deal?: boolean };
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    // Independent per-endpoint fetches — see lib/fetch-json.ts — so a failed/empty response
    // from any one can't throw inside Promise.all and blank the whole page.
    Promise.all([
      fetchJson<{ products: Product[] }>("/api/products"),
      fetchJson<{ inventoryItems: InventoryItem[] }>("/api/inventory"),
      fetchJson<{ productions: Production[] }>("/api/productions"),
    ]).then(([p, i, pr]) => {
      const failed = [p, i, pr].find((r) => !r.ok);
      setLoadError(failed ? failed.error : "");
      setProducts(p.ok ? p.data?.products ?? [] : []);
      setInventoryItems(i.ok ? i.data?.inventoryItems ?? [] : []);
      setProductions(pr.ok ? pr.data?.productions ?? [] : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const requested = searchParams.get("productId");
    if (requested) setTab("product");
  }, [searchParams]);

  const rawItems = inventoryItems.filter((i) => i.item_type === "ready_made");
  const selfMadeItems = inventoryItems.filter((i) => i.item_type === "self_made");

  if (loading) {
    return (
      <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
        <PageLoader label="Loading recipes…" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      {loadError && (
        <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
          Couldn&apos;t load recipe data: {loadError}
        </p>
      )}
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

      {tab === "product" && <ProductRecipesTab products={products.filter((p) => !p.is_deal)} rawItems={rawItems} initialProductId={searchParams.get("productId")} />}
      {tab === "selfmade" && <SelfMadeRecipesTab selfMadeItems={selfMadeItems} rawItems={rawItems} />}
      {tab === "history" && <HistoryTab productions={productions} />}
    </main>
  );
}

const ERR = "rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400";
const OK = "rounded-lg border border-basil-500/30 bg-basil-500/10 px-3 py-2 text-xs text-basil-400";

/** Units that can be added together when working out a batch's weight: weight units to grams, volume units to ml. */
const UNIT_FACTORS: Record<string, [string, number]> = {
  mg: ["mass", 0.001], g: ["mass", 1], gm: ["mass", 1], gram: ["mass", 1], grams: ["mass", 1],
  kg: ["mass", 1000], kgs: ["mass", 1000], kilo: ["mass", 1000], kilogram: ["mass", 1000], kilograms: ["mass", 1000],
  oz: ["mass", 28.3495], lb: ["mass", 453.592], lbs: ["mass", 453.592],
  ml: ["volume", 1], l: ["volume", 1000], lt: ["volume", 1000], ltr: ["volume", 1000], liter: ["volume", 1000], litre: ["volume", 1000], liters: ["volume", 1000], litres: ["volume", 1000],
};
const normUnit = (u: string) => u.trim().toLowerCase().replace(/\./g, "");
/** `qty` of `from` expressed in `to`; null when the two units can't be compared (e.g. pcs vs kg). */
function convertQty(qty: number, from: string, to: string): number | null {
  const f = normUnit(from);
  const t = normUnit(to);
  if (f === t) return qty;
  const a = UNIT_FACTORS[f];
  const b = UNIT_FACTORS[t];
  return a && b && a[0] === b[0] ? (qty * a[1]) / b[1] : null;
}
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function ProductRecipesTab({ products, rawItems, initialProductId }: { products: Product[]; rawItems: InventoryItem[]; initialProductId: string | null }) {
  const [productId, setProductId] = useState(initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : products[0]?.id ?? "");
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [linesLoading, setLinesLoading] = useState(false);

  useEffect(() => {
    if ((!productId || !products.some((p) => p.id === productId)) && products[0]) setProductId(products[0].id);
  }, [products, productId]);

  async function loadLines(id: string) {
    setLinesLoading(true);
    try {
      const d = await (await fetch(`/api/recipes?productId=${id}`)).json();
      setLines(d.recipeItems ?? []);
    } finally {
      setLinesLoading(false);
    }
  }
  useEffect(() => {
    if (!productId) return;
    setError("");
    setSaved("");
    loadLines(productId);
  }, [productId]);

  const costPerUnit = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.inventory_items?.cost ?? 0), 0);

  function addRow() {
    const qty = Number(newQty);
    if (!newItemId || !(qty > 0)) {
      setError("Choose an ingredient and enter a quantity above 0");
      return;
    }
    const item = rawItems.find((i) => i.id === newItemId);
    if (!item) return;
    setError("");
    setSaved("");
    setLines((prev) => {
      const existing = prev.find((l) => l.inventory_item_id === newItemId);
      const line = { inventory_item_id: newItemId, quantity: qty, inventory_items: { name: item.name, unit: item.unit, cost: item.cost } };
      if (existing) return prev.map((l) => (l.inventory_item_id === newItemId ? line : l));
      return [...prev, line];
    });
    setNewItemId("");
    setNewQty("1");
  }
  function removeRow(id: string) {
    setSaved("");
    setLines((prev) => prev.filter((l) => l.inventory_item_id !== id));
  }
  function setLineQty(id: string, v: string) {
    setSaved("");
    setLines((prev) => prev.map((l) => (l.inventory_item_id === id ? { ...l, quantity: v === "" ? 0 : Number(v) } : l)));
  }
  async function save() {
    if (lines.some((l) => !(Number(l.quantity) > 0))) return setError("Every ingredient needs a quantity above 0");
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, items: lines.map((l) => ({ inventoryItemId: l.inventory_item_id, quantity: Number(l.quantity) })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "The recipe could not be saved");
        return;
      }
      await loadLines(productId); // show what is really stored now
      setSaved(lines.length ? `Recipe saved - ${lines.length} ingredient${lines.length === 1 ? "" : "s"}` : "Recipe cleared");
    } catch {
      setError("Couldn't reach the server - the recipe was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel loading={linesLoading || saving}>
      <PanelHead title="Recipes (menu items)" subtitle="Ingredients consumed per menu item — stock deducts automatically on sale. Deals have no recipe of their own: they use the recipes of the products inside them." />
      <div className="p-5 space-y-4">
        {error && <p className={ERR}>{error}</p>}
        {saved && <p className={OK}>{saved}</p>}
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
            <div key={l.inventory_item_id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{l.inventory_items?.name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={l.quantity || ""}
                onChange={(e) => setLineQty(l.inventory_item_id, e.target.value)}
                className="h-8 w-24 rounded-md border border-line bg-raised px-2 text-right font-mono text-sm outline-none focus:border-chili-500"
              />
              <span className="w-10 text-xs text-ink-faint">{l.inventory_items?.unit}</span>
              <span className="w-24 text-right font-mono text-xs text-ink-mid">{fmtMoney(Number(l.quantity) * Number(l.inventory_items?.cost ?? 0))}</span>
              <button onClick={() => removeRow(l.inventory_item_id)} className="text-ink-faint hover:text-crimson-400" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-sm text-ink-faint">No ingredients yet.</p>}
        </div>

        <div className="grid grid-cols-[1fr_110px_40px] gap-2">
          <SearchSelect
            options={rawItems.map((i) => ({ id: i.id, label: i.name, hint: `${i.unit} · ${fmtMoney(i.cost)}` }))}
            value={newItemId}
            onChange={setNewItemId}
            placeholder="Search ingredient…"
            emptyText="No ingredient matches"
          />
          <input value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRow()} type="number" step="0.01" className={inputCls} placeholder="Qty" />
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
  const [lines, setLines] = useState<ProdRecipeLine[]>([]); // quantities are for the WHOLE batch
  const [weight, setWeight] = useState("1"); // final product weight of the batch, in the item's unit
  const [weightEdited, setWeightEdited] = useState(false); // false = follow the ingredients' total
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [linesLoading, setLinesLoading] = useState(false);

  const item = selfMadeItems.find((i) => i.id === itemId);
  const unit = item?.unit ?? "unit";

  useEffect(() => {
    if (!itemId && selfMadeItems[0]) setItemId(selfMadeItems[0].id);
  }, [selfMadeItems, itemId]);

  async function loadRecipe(id: string) {
    setLinesLoading(true);
    try {
      const d = await (await fetch(`/api/production-recipes?itemId=${id}`)).json();
      const W = Number(d.yieldWeight) > 0 ? Number(d.yieldWeight) : 1; // recipes saved before batches were per 1 unit
      const rows: ProdRecipeLine[] = (d.recipeItems ?? []).map((r: ProdRecipeLine) => ({ ...r, quantity: round4(Number(r.quantity) * W) }));
      setLines(rows);
      setWeight(String(W));
      setWeightEdited(rows.length > 0); // a recipe that exists keeps its saved weight; a new one follows the ingredients
    } finally {
      setLinesLoading(false);
    }
  }
  useEffect(() => {
    if (!itemId) return;
    setError("");
    setSaved("");
    loadRecipe(itemId);
  }, [itemId]);

  // weight worked out from the ingredients (only those whose unit can be converted to the item's unit)
  const { computedWeight, skipped } = useMemo(() => {
    let total = 0;
    let skip = 0;
    for (const l of lines) {
      const c = convertQty(Number(l.quantity) || 0, l.ingredient?.unit ?? "", unit);
      if (c === null) skip += 1;
      else total += c;
    }
    return { computedWeight: round4(total), skipped: skip };
  }, [lines, unit]);

  useEffect(() => {
    if (!weightEdited && computedWeight > 0) setWeight(String(computedWeight));
  }, [computedWeight, weightEdited]);

  const totalCost = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.ingredient?.cost ?? 0), 0);
  const w = Number(weight);
  const costPerUnit = w > 0 ? totalCost / w : 0;

  function addRow() {
    const qty = Number(newQty);
    if (!newIngredientId || !(qty > 0)) {
      setError("Choose an ingredient and enter a quantity above 0");
      return;
    }
    const ing = rawItems.find((i) => i.id === newIngredientId);
    if (!ing) return;
    setError("");
    setSaved("");
    setLines((prev) => {
      const line = { ingredient_item_id: newIngredientId, quantity: qty, ingredient: { name: ing.name, unit: ing.unit, cost: ing.cost } };
      return prev.some((l) => l.ingredient_item_id === newIngredientId) ? prev.map((l) => (l.ingredient_item_id === newIngredientId ? line : l)) : [...prev, line];
    });
    setNewIngredientId("");
    setNewQty("1");
  }
  function removeRow(id: string) {
    setSaved("");
    setLines((prev) => prev.filter((l) => l.ingredient_item_id !== id));
  }
  function setLineQty(id: string, v: string) {
    setSaved("");
    setLines((prev) => prev.map((l) => (l.ingredient_item_id === id ? { ...l, quantity: v === "" ? 0 : Number(v) } : l)));
  }
  async function save() {
    if (lines.some((l) => !(Number(l.quantity) > 0))) return setError("Every ingredient needs a quantity above 0");
    if (!(w > 0)) return setError("Enter the final product weight (more than 0)");
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/production-recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, items: lines.map((l) => ({ ingredientItemId: l.ingredient_item_id, quantity: Number(l.quantity) })), yieldWeight: w }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "The recipe could not be saved");
        return;
      }
      await loadRecipe(itemId);
      setSaved(`Recipe saved - ${fmtMoney(costPerUnit)} per ${unit}`);
    } catch {
      setError("Couldn't reach the server - the recipe was not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (selfMadeItems.length === 0) {
    return (
      <Panel>
        <PanelHead title="Self-made item recipes" subtitle="Raw ingredients for in-house items — their cost is calculated automatically" />
        <p className="p-5 text-sm text-ink-faint">
          No self-made items yet — mark an item as &quot;Self Made&quot; on the Inventory page first.
        </p>
      </Panel>
    );
  }

  return (
    <Panel loading={linesLoading || saving}>
      <PanelHead title="Self-made item recipes" subtitle="Enter the ingredients for one batch and the weight it makes - the cost per unit is worked out for you" />
      <div className="p-5 space-y-4">
        {error && <p className={ERR}>{error}</p>}
        {saved && <p className={OK}>{saved}</p>}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-mid">Self-made item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
            {selfMadeItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          {lines.map((l) => (
            <div key={l.ingredient_item_id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{l.ingredient?.name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={l.quantity || ""}
                onChange={(e) => setLineQty(l.ingredient_item_id, e.target.value)}
                className="h-8 w-24 rounded-md border border-line bg-raised px-2 text-right font-mono text-sm outline-none focus:border-chili-500"
              />
              <span className="w-10 text-xs text-ink-faint">{l.ingredient?.unit}</span>
              <span className="w-24 text-right font-mono text-xs text-ink-mid">{fmtMoney(Number(l.quantity) * Number(l.ingredient?.cost ?? 0))}</span>
              <button onClick={() => removeRow(l.ingredient_item_id)} className="text-ink-faint hover:text-crimson-400" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-sm text-ink-faint">No ingredients yet.</p>}
        </div>

        <div className="grid grid-cols-[1fr_110px_40px] gap-2">
          <SearchSelect
            options={rawItems.filter((i) => i.id !== itemId).map((i) => ({ id: i.id, label: i.name, hint: `${i.unit} · ${fmtMoney(i.cost)}` }))}
            value={newIngredientId}
            onChange={setNewIngredientId}
            placeholder="Search ingredient…"
            emptyText="No ingredient matches"
          />
          <input value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRow()} type="number" step="0.01" className={inputCls} placeholder="Qty" />
          <button onClick={addRow} className="rounded-md bg-raised hover:bg-hover text-sm font-semibold">
            +
          </button>
        </div>

        {/* the finished batch */}
        <div className="grid gap-3 rounded-xl border border-line bg-raised/40 p-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-mid">Final product weight ({unit})</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setWeightEdited(true);
                setSaved("");
              }}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-ink-faint">
              {weightEdited && computedWeight > 0 ? (
                <>
                  Ingredients add up to {computedWeight} {unit}.{" "}
                  <button type="button" onClick={() => setWeightEdited(false)} className="font-semibold text-chili-500 hover:underline">
                    Use that
                  </button>
                </>
              ) : computedWeight > 0 ? (
                `Added up from the ingredients - edit it to the real weight after cooking.${skipped ? ` ${skipped} ingredient${skipped === 1 ? "" : "s"} in other units not counted.` : ""}`
              ) : (
                "Enter how much this batch makes."
              )}
            </span>
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-mid">Total cost of final product</span>
            <div className="flex h-[38px] items-center rounded-lg border border-line bg-canvas px-3 font-mono text-sm">{fmtMoney(totalCost)}</div>
            <span className="mt-1 block text-[11px] text-ink-faint">All ingredients in the batch</span>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-mid">Cost per {unit}</span>
            <div className="flex h-[38px] items-center rounded-lg border border-line bg-canvas px-3 font-mono text-sm font-semibold text-chili-500">{fmtMoney(costPerUnit)}</div>
            <span className="mt-1 block text-[11px] text-ink-faint">Total cost ÷ weight (calculated)</span>
          </div>
        </div>

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
