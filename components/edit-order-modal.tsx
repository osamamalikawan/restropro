"use client";
import { useEffect, useState } from "react";

export type EditableSaleItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
};

type Product = { id: string; name: string; price: number };

/** Reopens a fired/completed order for editing — matches the prototype's
 *  orderEditOverlay (openEditOrder/oeAddLine/saveOrderEdit). Add/remove items, quantities
 *  adjust, and the total recalculates live; saving hits /api/sales/edit which reconciles
 *  stock and the accounts entry in one DB transaction (see edit_sale migration). */
export function EditOrderModal({
  saleId,
  orderNo,
  taxRate,
  deliveryCharge,
  initialItems,
  onClose,
  onSaved,
}: {
  saleId: string;
  orderNo: number;
  taxRate: number;
  deliveryCharge: number;
  initialItems: EditableSaleItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<EditableSaleItem[]>(initialItems);
  const [products, setProducts] = useState<Product[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => {
        const list: Product[] = (d.products ?? []).map((p: any) => ({ id: p.id, name: p.name, price: p.price }));
        setProducts(list);
        if (list[0]) setAddProductId(list[0].id);
      });
  }, []);

  const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax + deliveryCharge;

  function changeQty(idx: number, delta: number) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + delta };
      return next.filter((it) => it.quantity > 0);
    });
  }

  function addLine() {
    const product = products.find((p) => p.id === addProductId);
    if (!product || addQty <= 0) return;
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) {
        return prev.map((it) => (it.product_id === product.id ? { ...it, quantity: it.quantity + addQty } : it));
      }
      return [...prev, { product_id: product.id, name: product.name, unit_price: product.price, quantity: addQty }];
    });
  }

  async function save() {
    if (items.length === 0) {
      setError("Order must have at least one item — cancel it instead");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/sales/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        saleId,
        items: items.map((it) => ({ productId: it.product_id, name: it.name, price: it.unit_price, qty: it.quantity })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error || "Failed to save");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-display font-semibold text-base text-ink-strong">Edit order #{orderNo}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-raised border border-line text-ink-faint">
            ✕
          </button>
        </div>
        <div className="p-5">
          {error && <p className="text-crimson-400 text-sm mb-3">{error}</p>}
          <div className="max-h-56 overflow-y-auto space-y-2 mb-3">
            {items.length === 0 && <p className="text-xs text-ink-faint text-center py-6">No items — add one below, or cancel the order instead</p>}
            {items.map((it, idx) => (
              <div key={it.product_id} className="flex items-center gap-2 py-2 border-b border-line-soft text-sm">
                <div className="flex-1">
                  <div className="font-medium text-ink-strong">{it.name}</div>
                  <div className="text-[11px] text-ink-faint font-mono">Rs {it.unit_price.toLocaleString()} each</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => changeQty(idx, -1)} className="w-5 h-5 rounded bg-raised border border-line text-xs">
                    −
                  </button>
                  <span className="font-mono text-xs w-5 text-center">{it.quantity}</span>
                  <button onClick={() => changeQty(idx, 1)} className="w-5 h-5 rounded bg-raised border border-line text-xs">
                    +
                  </button>
                </div>
                <div className="font-mono text-xs w-16 text-right">Rs {(it.unit_price * it.quantity).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_80px_36px] gap-2 mb-4">
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="bg-raised border border-line rounded-lg px-2 py-1.5 text-xs"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={addQty}
              onChange={(e) => setAddQty(+e.target.value || 1)}
              className="bg-raised border border-line rounded-lg px-2 py-1.5 text-xs"
            />
            <button onClick={addLine} className="rounded-lg bg-raised border border-line text-sm" title="Add item">
              ＋
            </button>
          </div>
          <div className="border-t border-line pt-3 text-sm space-y-1">
            <div className="flex justify-between text-ink-mid text-xs">
              <span>Subtotal</span>
              <span>Rs {subtotal.toLocaleString()}</span>
            </div>
            {deliveryCharge > 0 && (
              <div className="flex justify-between text-ink-mid text-xs">
                <span>Delivery charge</span>
                <span>Rs {deliveryCharge.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-ink-mid text-xs">
              <span>Tax</span>
              <span>Rs {tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-mono font-bold text-base text-ink-strong border-t border-dashed border-line pt-2 mt-1">
              <span>New total</span>
              <span>Rs {total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line-soft">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-sm text-ink-mid">
            Discard
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-chili-500 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
