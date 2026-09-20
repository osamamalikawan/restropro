"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readFast, pullAndCache, startBackgroundSync } from "@/lib/sync";

type Product = { id: string; name: string; price: number; is_available: boolean };
type CartLine = { productId: string; name: string; price: number; qty: number };
type Table = { id: string; number: string; seats: number };
type Area = { id: string; name: string; delivery_fee: number };
type OrderType = "dine_in" | "takeaway" | "delivery";

export function PosClient({
  restaurantId,
  restaurantName,
  cashierName,
}: {
  restaurantId: string;
  restaurantName: string;
  cashierName: string;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [taxRate, setTaxRate] = useState(0.05); // replaced with the tenant's real rate once Settings loads
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [tableId, setTableId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["Cash"]);
  const [amountReceived, setAmountReceived] = useState("0");
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [showNewCustFields, setShowNewCustFields] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orderNo: number; total: number; balance: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await readFast<Product>("products", restaurantId);
      if (!cancelled) setProducts(local);
      await pullAndCache("products", restaurantId);
      const refreshed = await readFast<Product>("products", restaurantId);
      if (!cancelled) setProducts(refreshed);
    })();
    const stop = startBackgroundSync("products", restaurantId);

    // Tables/areas are low-frequency admin data (rarely change during a shift) — plain fetch
    // is fine here, same reasoning as the Menu/Inventory back-office screens.
    fetch("/api/tables").then((r) => r.json()).then((d) => setTables(d.tables ?? []));
    fetch("/api/delivery-areas").then((r) => r.json()).then((d) => setAreas(d.areas ?? []));
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.settings?.tax_rate != null) setTaxRate(Number(d.settings.tax_rate) / 100);
    });
    fetch("/api/payment-methods").then((r) => r.json()).then((d) => {
      const names = (d.methods ?? []).map((m: { name: string }) => m.name);
      if (names.length) {
        setPaymentMethods(names);
        setPaymentMethod(names[0]);
      }
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [restaurantId]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  }
  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }
  function selectOrderType(t: OrderType) {
    setOrderType(t);
    if (t !== "dine_in") setTableId("");
    if (t !== "delivery") {
      setAreaId("");
      setDeliveryCharge(0);
    }
  }
  function onAreaChange(id: string) {
    setAreaId(id);
    const area = areas.find((a) => a.id === id);
    setDeliveryCharge(area ? area.delivery_fee : 0);
  }

  async function searchCustomers(q: string) {
    setCustSearch(q);
    if (!q.trim()) {
      setCustResults([]);
      return;
    }
    const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (res.ok) setCustResults(data.customers ?? []);
  }
  function selectCustomer(c: { id: string; name: string; phone: string }) {
    setSelectedCustomer(c);
    setCustResults([]);
    setCustSearch("");
    setShowNewCustFields(false);
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  const delivery = orderType === "delivery" ? deliveryCharge : 0;
  const total = subtotal + tax + delivery;

  async function completeSale() {
    if (orderType === "dine_in" && !tableId) {
      setError("Select a table first");
      return;
    }
    const received = Number(amountReceived);
    if (Number.isNaN(received) || received < 0) {
      setError("Enter a valid amount received");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderType,
        items: cart.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })),
        payments: received > 0 ? [{ method: paymentMethod, amount: received }] : [],
        tableId: tableId || null,
        areaId: areaId || null,
        deliveryCharge: delivery,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer ? undefined : newCustName || undefined,
        customerPhone: selectedCustomer ? undefined : newCustPhone || undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Checkout failed");
      return;
    }
    setLastReceipt({ orderNo: data.orderNo, total: data.total, balance: data.balance ?? 0 });
    setCart([]);
    setCheckoutOpen(false);
    setSelectedCustomer(null);
    setNewCustName("");
    setNewCustPhone("");
    setShowNewCustFields(false);
  }

  const ORDER_TYPES: { id: OrderType; label: string }[] = [
    { id: "dine_in", label: "🍽 Dine In" },
    { id: "takeaway", label: "🥡 Takeaway" },
    { id: "delivery", label: "🛵 Delivery" },
  ];

  return (
    <main className="min-h-screen bg-canvas text-ink-strong flex flex-col md:flex-row">
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-xl font-semibold">{restaurantName} — POS</h1>
            <p className="text-ink-faint text-xs">Cashier: {cashierName}</p>
          </div>
          <Link href="/dashboard" className="text-xs text-ink-mid underline hover:text-ink-strong">
            ← Dashboard
          </Link>
        </div>

        {products === null ? (
          <p className="text-ink-faint text-sm">Loading menu…</p>
        ) : products.length === 0 ? (
          <p className="text-ink-faint text-sm">
            No products yet — add some from <Link href="/dashboard/menu" className="underline">Menu</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products
              .filter((p) => p.is_available !== false)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="rounded-xl border border-line bg-surface hover:border-chili-500 p-4 text-left transition-colors"
                >
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-basil-400 text-sm mt-1">Rs {p.price}</div>
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-line bg-surface p-6 flex flex-col">
        <h2 className="font-display text-lg font-semibold mb-3">Current order</h2>

        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => selectOrderType(t.id)}
              className={`rounded-lg py-2 text-xs font-semibold border ${
                orderType === t.id ? "bg-chili-500/20 border-chili-500 text-chili-400" : "border-line text-ink-mid"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {orderType === "dine_in" && (
          <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="w-full rounded-md bg-raised border border-line px-3 py-2 text-sm mb-3">
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} ({t.seats} seats)
              </option>
            ))}
          </select>
        )}
        {orderType === "delivery" && (
          <select value={areaId} onChange={(e) => onAreaChange(e.target.value)} className="w-full rounded-md bg-raised border border-line px-3 py-2 text-sm mb-3">
            <option value="">Select area…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — Rs {a.delivery_fee}
              </option>
            ))}
          </select>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {cart.length === 0 ? (
            <p className="text-ink-faint text-sm">Tap a product to start an order.</p>
          ) : (
            cart.map((l) => (
              <div key={l.productId} className="flex items-center justify-between text-sm border-b border-line pb-2">
                <span>{l.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(l.productId, -1)} className="w-5 h-5 rounded bg-raised hover:bg-hover">
                    −
                  </button>
                  <span className="w-4 text-center">{l.qty}</span>
                  <button onClick={() => changeQty(l.productId, 1)} className="w-5 h-5 rounded bg-raised hover:bg-hover">
                    +
                  </button>
                  <span className="w-14 text-right font-mono">{l.price * l.qty}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-line pt-3 space-y-1 text-sm mb-4">
          <div className="flex justify-between text-ink-mid">
            <span>Subtotal</span>
            <span>Rs {subtotal}</span>
          </div>
          {delivery > 0 && (
            <div className="flex justify-between text-ink-mid">
              <span>Delivery</span>
              <span>Rs {delivery}</span>
            </div>
          )}
          <div className="flex justify-between text-ink-mid">
            <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
            <span>Rs {tax}</span>
          </div>
          <div className="flex justify-between font-semibold text-base pt-1 border-t border-dashed border-line">
            <span>Total</span>
            <span>Rs {total}</span>
          </div>
        </div>
        <button
          disabled={cart.length === 0}
          onClick={() => {
            setAmountReceived(String(total));
            setCheckoutOpen(true);
          }}
          className="w-full rounded-lg bg-basil-500 hover:bg-basil-600 disabled:opacity-40 text-white font-semibold py-2.5"
        >
          Checkout
        </button>

        {lastReceipt && (
          <p className="text-xs text-basil-400 mt-3 text-center">
            Order #{lastReceipt.orderNo} {lastReceipt.balance > 0 ? "saved" : "completed"} — Rs {lastReceipt.total}
            {lastReceipt.balance > 0 && ` (Rs ${lastReceipt.balance} still due)`}
          </p>
        )}
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">Payment</h3>
            <div className="flex justify-between text-sm">
              <span>Total due</span>
              <span className="font-mono font-semibold">Rs {total}</span>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-ink-faint">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-md bg-raised border border-line px-3 py-2 mt-1 text-sm">
                  <span>
                    {selectedCustomer.name} <span className="text-ink-faint">· {selectedCustomer.phone}</span>
                  </span>
                  <button onClick={() => setSelectedCustomer(null)} className="text-ink-faint hover:text-crimson-400">
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={custSearch}
                    onChange={(e) => searchCustomers(e.target.value)}
                    placeholder="Search by name or phone…"
                    className="w-full rounded-md bg-raised border border-line px-3 py-2 text-sm mt-1"
                  />
                  {custResults.length > 0 && (
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-line">
                      {custResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-hover border-b border-line last:border-b-0"
                        >
                          {c.name} <span className="text-ink-faint">· {c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNewCustFields((v) => !v)}
                    className="text-xs text-ink-faint hover:text-ink-strong underline mt-1"
                  >
                    + New customer
                  </button>
                  {showNewCustFields && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        placeholder="Name"
                        className="rounded-md bg-raised border border-line px-3 py-2 text-sm"
                      />
                      <input
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        placeholder="Phone"
                        className="rounded-md bg-raised border border-line px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-md bg-raised border border-line px-3 py-2"
            >
              {paymentMethods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <div>
              <label className="text-xs uppercase tracking-wide text-ink-faint">Amount received</label>
              <input
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="w-full rounded-md bg-raised border border-line px-3 py-2 text-sm mt-1"
              />
              {Number(amountReceived) < total && (
                <p className="text-xs text-turmeric-400 mt-1">
                  Rs {Math.max(total - (Number(amountReceived) || 0), 0)} will be left as an unpaid balance — collectable
                  later from Unpaid Orders.
                </p>
              )}
            </div>
            {error && <p className="text-crimson-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setCheckoutOpen(false)}
                className="flex-1 rounded-lg bg-raised hover:bg-hover py-2.5 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={completeSale}
                disabled={submitting}
                className="flex-1 rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5"
              >
                {submitting ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
