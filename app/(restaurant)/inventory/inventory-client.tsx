"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Pencil } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { LoadMore, useProgressive } from "@/components/ui/load-more";

type Item = {
  id: string;
  name: string;
  unit: string;
  item_type: "ready_made" | "self_made";
  category: string | null;
  current_stock: number;
  min_stock: number;
  cost: number;
};
type Purchase = { inventory_item_id: string; suppliers?: { name: string } | null };
type Ingredient = { id: string; name: string; category: string; item_type: "ready_made" | "self_made"; unit: string; alreadyAdded: boolean };

function stockStatus(i: Item) {
  // A sale can take more than is on the shelf: the stock then goes negative (the amount still owed
  // to the kitchen) and the next restock is netted against it.
  if (i.current_stock < 0) return { label: "Negative stock", color: "#B7383F" };
  if (i.current_stock === 0) return { label: "Out of stock", color: "#B7383F" };
  if (i.current_stock < i.min_stock) return { label: "Low stock", color: "#C99A3E" };
  return { label: "In stock", color: "#3F6E52" };
}

export function InventoryClient() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fType, setFType] = useState<"ready_made" | "self_made">("ready_made");
  const [fUnit, setFUnit] = useState("pcs");
  const [fMinStock, setFMinStock] = useState("10");
  const [fCost, setFCost] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  // "Import ingredients" — pick from the platform's master ingredient list
  const [importOpen, setImportOpen] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingLoading, setIngLoading] = useState(false);
  const [ingError, setIngError] = useState("");
  const [ingQ, setIngQ] = useState("");
  const [ingCat, setIngCat] = useState("all");
  const [ingSel, setIngSel] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    const [iRes, pRes] = await Promise.all([
      fetchJson<{ inventoryItems: Item[] }>("/api/inventory"),
      fetchJson<{ purchases: Purchase[] }>("/api/restock?limit=1000"),
    ]);
    if (!iRes.ok) {
      setLoadError(iRes.error);
      setItems([]);
    } else {
      setItems(iRes.data?.inventoryItems ?? []);
    }
    setPurchases(pRes.ok ? pRes.data?.purchases ?? [] : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function openImport() {
    setImportOpen(true);
    setIngError("");
    setImportMsg("");
    setIngSel(new Set());
    setIngQ("");
    setIngCat("all");
    setIngLoading(true);
    const res = await fetchJson<{ ingredients: Ingredient[] }>("/api/ingredients");
    setIngLoading(false);
    if (!res.ok) {
      setIngError(res.error);
      setIngredients([]);
      return;
    }
    setIngredients(res.data?.ingredients ?? []);
  }

  const ingCategories = useMemo(() => Array.from(new Set(ingredients.map((i) => i.category))).sort(), [ingredients]);
  const ingVisible = useMemo(() => {
    const query = ingQ.toLowerCase();
    return ingredients.filter((i) => (ingCat === "all" || i.category === ingCat) && (!query || i.name.toLowerCase().includes(query)));
  }, [ingredients, ingQ, ingCat]);
  const ingSelectable = ingVisible.filter((i) => !i.alreadyAdded);
  const newCount = ingredients.filter((i) => !i.alreadyAdded).length;

  function toggleIng(id: string) {
    setIngSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setIngSel((cur) => {
      const allOn = ingSelectable.length > 0 && ingSelectable.every((i) => cur.has(i.id));
      const next = new Set(cur);
      ingSelectable.forEach((i) => (allOn ? next.delete(i.id) : next.add(i.id)));
      return next;
    });
  }

  async function runImport(body: { ids?: string[]; all?: boolean }) {
    setImporting(true);
    setIngError("");
    setImportMsg("");
    const res = await fetchJson<{ imported: number; skipped: number }>("/api/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setImporting(false);
    if (!res.ok) {
      setIngError(res.error);
      return;
    }
    setImportMsg(`Added ${res.data?.imported ?? 0} item(s)${res.data?.skipped ? `, ${res.data.skipped} already in your inventory` : ""}.`);
    setIngSel(new Set());
    await Promise.all([load(), fetchJson<{ ingredients: Ingredient[] }>("/api/ingredients").then((r) => r.ok && setIngredients(r.data?.ingredients ?? []))]);
  }

  const suppliersFor = (itemId: string, type: Item["item_type"]) => {
    if (type === "self_made") return "In-house";
    const names = Array.from(new Set(purchases.filter((p) => p.inventory_item_id === itemId).map((p) => p.suppliers?.name).filter(Boolean)));
    return names.length ? names.join(", ") : "—";
  };

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(query));
  }, [items, q]);

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFCategory("");
    setFType("ready_made");
    setFUnit("pcs");
    setFMinStock("10");
    setFCost("0");
    setError("");
    setModalOpen(true);
  }
  function openEdit(i: Item) {
    setEditingId(i.id);
    setFName(i.name);
    setFCategory(i.category ?? "");
    setFType(i.item_type);
    setFUnit(i.unit);
    setFMinStock(String(i.min_stock));
    setFCost(String(i.cost));
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fName.trim()) {
      setError("Item name is required");
      return;
    }
    setSaving(true);
    setError("");
    const isSelf = fType === "self_made";
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: {
          id: editingId ?? undefined,
          name: fName.trim(),
          category: fCategory.trim() || null,
          item_type: fType,
          unit: fUnit.trim() || "pcs",
          min_stock: Number(fMinStock),
          // Self-made cost is computed from its recipe (via log_production) — don't let a
          // manual entry here overwrite that; only send cost for ready-made items.
          ...(isSelf ? {} : { cost: Number(fCost) }),
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save item");
      return;
    }
    setModalOpen(false);
    await load();
  }

  const pg = useProgressive(filtered); // first 50 rows now, the rest as you scroll — keeps big tables fast

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead title="Stock & inventory" subtitle="Definitions only — add stock from Restock">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item…" className={searchInputCls} />
          <button onClick={openImport} className={btnGhost}>
            Import ingredients
          </button>
          <button onClick={openAdd} className={addBtnCls}>
            + Add item
          </button>
        </PanelHead>
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load inventory: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Item</Th>
                <Th>Type</Th>
                <Th>Suppliers</Th>
                <Th>Stock level</Th>
                <Th>Unit cost</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pg.visible.map((i) => {
                const st = stockStatus(i);
                const pct = Math.max(0, Math.min(100, Math.round((i.current_stock / (i.min_stock * 2 || 1)) * 100)));
                return (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <Td>
                      <div className="font-medium text-ink-strong">{i.name}</div>
                      {i.category && <div className="text-xs text-ink-mid">{i.category}</div>}
                    </Td>
                    <Td>
                      <Badge tone={i.item_type === "self_made" ? "basil" : "turmeric"}>{i.item_type === "self_made" ? "Self Made" : "Ready Made"}</Badge>
                    </Td>
                    <Td className="text-ink-mid">{suppliersFor(i.id, i.item_type)}</Td>
                    <Td>
                      <div className="text-sm">
                        <span className={i.current_stock < 0 ? "font-semibold text-crimson-400" : ""}>
                          {Math.round(Number(i.current_stock) * 1000) / 1000} {i.unit}
                        </span>{" "}
                        <span className="text-ink-mid text-xs">min @ {i.min_stock}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-28 rounded-full bg-raised overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: st.color }} />
                      </div>
                    </Td>
                    <Td className="font-mono">{fmtMoney(i.cost)}</Td>
                    <Td>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `${st.color}22`, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <IconBtn
                          title={i.item_type === "self_made" ? "Log production" : "Restock this item"}
                          onClick={() => router.push(`/restock?itemId=${i.id}`)}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Edit" onClick={() => openEdit(i)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {!loading && !loadError && filtered.length === 0 && <EmptyRow colSpan={7} label="No inventory items yet." />}
            </tbody>
          </table>
        </TableScroll>
        <LoadMore hasMore={pg.hasMore} loading={false} onMore={pg.showMore} />
      </Panel>

      <Modal
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit inventory item" : "Add inventory item"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} placeholder="e.g. Mozzarella cheese" />
        </Field>
        <Field label="Category">
          <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls} placeholder="e.g. Dairy" />
        </Field>
        <Field label="Type">
          <select value={fType} onChange={(e) => setFType(e.target.value as any)} className={inputCls}>
            <option value="ready_made">Ready Made</option>
            <option value="self_made">Self Made</option>
          </select>
        </Field>
        <p className="text-xs text-ink-faint -mt-1">
          {fType === "self_made"
            ? "Self-made items are prepared in-house — restock by logging production, and cost is calculated automatically from its recipe (Recipes & Production)."
            : "Ready-made items are bought directly from suppliers — link suppliers from the Restock page."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit">
            <select value={fUnit} onChange={(e) => setFUnit(e.target.value)} className={inputCls}>
              <option value="pcs">pcs</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              {/* an item created earlier with another unit (kg, ltr…) keeps it until you change it */}
              {!["pcs", "g", "ml"].includes(fUnit) && <option value={fUnit}>{fUnit}</option>}
            </select>
          </Field>
          <Field label="Min stock">
            <input value={fMinStock} onChange={(e) => setFMinStock(e.target.value)} type="number" min="0" className={inputCls} />
          </Field>
        </div>
        <Field label="Unit cost">
          <input
            value={fType === "self_made" ? "Computed from recipe" : fCost}
            disabled={fType === "self_made"}
            onChange={(e) => setFCost(e.target.value)}
            type={fType === "self_made" ? "text" : "number"}
            className={`${inputCls} disabled:opacity-60`}
          />
        </Field>
      </Modal>

      <Modal
        busy={importing}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import ingredients"
        width="max-w-2xl"
        footer={
          <>
            <button onClick={() => setImportOpen(false)} className={btnGhost}>
              Close
            </button>
            <button onClick={() => runImport({ all: true })} disabled={importing || newCount === 0} className={btnGhost}>
              Add all new ({newCount})
            </button>
            <button onClick={() => runImport({ ids: Array.from(ingSel) })} disabled={importing || ingSel.size === 0} className={btnPrimary}>
              {importing ? "Adding…" : `Add selected (${ingSel.size})`}
            </button>
          </>
        }
      >
        <p className="text-xs text-ink-faint">
          Pick from the shared ingredient list. Items you already have are skipped. They arrive with zero stock and zero cost, so set those from Restock.
        </p>
        {ingError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{ingError}</p>}
        {importMsg && <p className="rounded-lg border border-basil-500/30 bg-basil-500/10 px-3 py-2 text-xs text-basil-400">{importMsg}</p>}
        <div className="flex gap-2">
          <input value={ingQ} onChange={(e) => setIngQ(e.target.value)} placeholder="Search ingredient…" className={inputCls} />
          <select value={ingCat} onChange={(e) => setIngCat(e.target.value)} className={`${inputCls} max-w-[200px]`}>
            <option value="all">All categories</option>
            {ingCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-mid">
          <input
            type="checkbox"
            checked={ingSelectable.length > 0 && ingSelectable.every((i) => ingSel.has(i.id))}
            onChange={toggleAllVisible}
            disabled={ingSelectable.length === 0}
          />
          Select all shown ({ingSelectable.length} new)
        </label>
        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-line divide-y divide-line">
          {ingLoading && <p className="p-4 text-sm text-ink-faint">Loading…</p>}
          {!ingLoading && ingVisible.length === 0 && <p className="p-4 text-sm text-ink-faint">No ingredients match.</p>}
          {ingVisible.map((i) => (
            <label key={i.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${i.alreadyAdded ? "opacity-50" : "cursor-pointer hover:bg-raised"}`}>
              <input type="checkbox" disabled={i.alreadyAdded} checked={ingSel.has(i.id)} onChange={() => toggleIng(i.id)} />
              <span className="flex-1">
                <span className="font-medium text-ink-strong">{i.name}</span>
                <span className="block text-xs text-ink-mid">
                  {i.category} · {i.item_type === "self_made" ? "Self Made" : "Ready Made"}
                </span>
              </span>
              {i.alreadyAdded && <span className="text-[11px] text-ink-faint">Already added</span>}
            </label>
          ))}
        </div>
      </Modal>
    </main>
  );
}
