"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Pencil } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

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

function stockStatus(i: Item) {
  if (i.current_stock <= 0) return { label: "Out of stock", color: "#B7383F" };
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

  const suppliersFor = (itemId: string, type: Item["item_type"]) => {
    if (type === "self_made") return "In-house";
    const names = Array.from(new Set(purchases.filter((p) => p.inventory_item_id === itemId).map((p) => p.suppliers?.name).filter(Boolean)));
    return names.length ? names.join(", ") : "—";
  };

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(query));
  }, [items, q]);
  const itemsPage = usePagination(filtered, 20);

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

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead title="Stock & inventory" subtitle="Definitions only — add stock from Restock">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item…" className={searchInputCls} />
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
              {itemsPage.pageItems.map((i) => {
                const st = stockStatus(i);
                const pct = Math.min(100, Math.round((i.current_stock / (i.min_stock * 2 || 1)) * 100));
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
                        {i.current_stock} {i.unit} <span className="text-ink-mid text-xs">min @ {i.min_stock}</span>
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
                          onClick={() => router.push(`/dashboard/restock?itemId=${i.id}`)}
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
        <Pagination page={itemsPage.page} pageCount={itemsPage.pageCount} onChange={itemsPage.setPage} total={itemsPage.total} pageSize={itemsPage.pageSize} />
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
            <input value={fUnit} onChange={(e) => setFUnit(e.target.value)} className={inputCls} placeholder="kg, pcs, ltr…" />
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
    </main>
  );
}
