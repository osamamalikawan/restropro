"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Pause, Plus, ShoppingBag, X } from "lucide-react";
import { LoadingOverlay, PageLoader, Spinner } from "@/components/ui/loading";
import { ThemeToggle } from "@/components/theme-toggle";
import { readFast, pullAndCache, startBackgroundSync } from "@/lib/sync";

type Product = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  // joined by /api/products; supabase returns an object for many-to-one, handle an array defensively
  menu_categories?: { name: string } | { name: string }[] | null;
};
type CartLine = { productId: string; name: string; price: number; qty: number };
type Table = { id: string; number: string; seats: number };
type Area = { id: string; name: string; delivery_fee: number };
type OrderType = "dine_in" | "takeaway" | "delivery";
type HeldTicket = {
  id: string;
  orderType: OrderType;
  tableId: string;
  areaId: string;
  deliveryCharge: number;
  cart: CartLine[];
  heldAt: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const categoryOf = (p: Product) => {
  const mc = p.menu_categories;
  const name = Array.isArray(mc) ? mc[0]?.name : mc?.name;
  return name || "Other";
};
const TYPE_TAG: Record<OrderType, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery" };
const FIELD =
  "w-full rounded-lg bg-raised border border-line px-3 py-2.5 text-sm outline-none focus:border-chili-500 transition-colors";

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

  // UI-only state (no effect on checkout payload)
  const [category, setCategory] = useState("All");
  const [sheetOpen, setSheetOpen] = useState(false); // mobile order sheet
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [heldLoaded, setHeldLoaded] = useState(false);
  const [isResumed, setIsResumed] = useState(false);
  const [brokenImgs, setBrokenImgs] = useState<Record<string, true>>({});

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

  // Held tickets live in this browser only (per restaurant) — they are parked carts, not saved sales.
  const heldKey = `rp_pos_held_${restaurantId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(heldKey);
      if (raw) setHeld(JSON.parse(raw));
    } catch {}
    setHeldLoaded(true);
  }, [heldKey]);
  useEffect(() => {
    if (!heldLoaded) return;
    try {
      localStorage.setItem(heldKey, JSON.stringify(held));
    } catch {}
  }, [held, heldLoaded, heldKey]);

  function addToCart(p: Product) {
    setLastReceipt(null);
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
  function clearTicket() {
    setCart([]);
    setIsResumed(false);
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
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  // ---- held tickets ----
  function snapshot(): HeldTicket {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderType,
      tableId,
      areaId,
      deliveryCharge,
      cart,
      heldAt: Date.now(),
    };
  }
  function holdCurrent() {
    if (cart.length === 0) return;
    setHeld((h) => [...h, snapshot()]);
    setCart([]);
    setTableId("");
    setAreaId("");
    setDeliveryCharge(0);
    setIsResumed(false);
    setSheetOpen(false);
  }
  function resumeHeld(t: HeldTicket) {
    // never lose what's on screen: park the current cart before loading the held one
    setHeld((h) => [...h.filter((x) => x.id !== t.id), ...(cart.length ? [snapshot()] : [])]);
    setOrderType(t.orderType);
    setTableId(t.tableId);
    setAreaId(t.areaId);
    setDeliveryCharge(t.deliveryCharge);
    setCart(t.cart);
    setIsResumed(true);
    setLastReceipt(null);
  }
  function discardHeld(id: string) {
    if (window.confirm("Discard this held ticket?")) setHeld((h) => h.filter((x) => x.id !== id));
  }
  function heldName(t: HeldTicket) {
    if (t.orderType === "dine_in") {
      const tb = tables.find((x) => x.id === t.tableId);
      return tb ? `Table ${tb.number}` : "Dine in";
    }
    return TYPE_TAG[t.orderType];
  }
  function heldTotal(t: HeldTicket) {
    const sub = t.cart.reduce((s, l) => s + l.price * l.qty, 0);
    return sub + Math.round(sub * taxRate) + (t.orderType === "delivery" ? t.deliveryCharge : 0);
  }

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
    setIsResumed(false);
    setCheckoutOpen(false);
    setSheetOpen(false);
    setSelectedCustomer(null);
    setNewCustName("");
    setNewCustPhone("");
    setShowNewCustFields(false);
  }

  const ORDER_TYPES: { id: OrderType; label: string; icon: string }[] = [
    { id: "dine_in", label: "Dine In", icon: "🍽" },
    { id: "takeaway", label: "Takeaway", icon: "🥡" },
    { id: "delivery", label: "Delivery", icon: "🛵" },
  ];

  const available = useMemo(() => (products ?? []).filter((p) => p.is_available !== false), [products]);
  const categories = useMemo(() => {
    const names = Array.from(new Set(available.map(categoryOf)));
    names.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
    return names;
  }, [available]);
  const visible = category === "All" ? available : available.filter((p) => categoryOf(p) === category);
  const qtyInCart = (id: string) => cart.find((l) => l.productId === id)?.qty ?? 0;

  return (
    <main className="h-[100dvh] bg-canvas text-ink-strong flex flex-col md:flex-row md:overflow-hidden">
      {/* ================= LEFT: menu ================= */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-5 pb-24 md:pb-5">
        {/* top bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="shrink-0 grid place-items-center w-9 h-9 rounded-lg border border-line bg-surface text-ink-mid hover:text-ink-strong hover:border-chili-500 transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight truncate">{restaurantName} — POS</h1>
              <p className="text-ink-faint text-xs truncate">Cashier: {cashierName}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* last sale banner */}
        {lastReceipt && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-basil-500/40 bg-basil-500/10 px-4 py-2.5 text-sm text-basil-400">
            <span>
              Order #{lastReceipt.orderNo} {lastReceipt.balance > 0 ? "saved" : "completed"} — Rs {fmt(lastReceipt.total)}
              {lastReceipt.balance > 0 && ` (Rs ${fmt(lastReceipt.balance)} still due)`}
            </span>
            <button onClick={() => setLastReceipt(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        )}

        {/* held tickets */}
        {held.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {held.map((t) => {
              const count = t.cart.reduce((s, l) => s + l.qty, 0);
              return (
                <div key={t.id} className="relative shrink-0">
                  <button
                    onClick={() => resumeHeld(t)}
                    className="min-w-[140px] rounded-xl border border-line bg-surface hover:border-chili-500 px-3 py-2.5 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-chili-400">{TYPE_TAG[t.orderType]}</span>
                      <span className="rounded-full bg-chili-500/20 px-2 py-0.5 text-[10px] font-bold text-chili-400">Held</span>
                    </div>
                    <div className="text-sm font-semibold">{heldName(t)}</div>
                    <div className="text-[11px] text-ink-faint">
                      {count} item(s) · Rs {fmt(heldTotal(t))}
                    </div>
                  </button>
                  <button
                    onClick={() => discardHeld(t.id)}
                    aria-label="Discard held ticket"
                    className="absolute bottom-2 right-2 grid place-items-center w-5 h-5 rounded text-ink-faint hover:text-crimson-400"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* order type */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => selectOrderType(t.id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 sm:py-4 text-xs sm:text-sm font-semibold transition-colors ${
                orderType === t.id
                  ? "bg-chili-500/15 border-chili-500 text-chili-400"
                  : "bg-surface border-line text-ink-mid hover:border-chili-500/60"
              }`}
            >
              <span className="text-base sm:text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* categories */}
        {categories.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {["All", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  category === c
                    ? "bg-chili-500 border-chili-500 text-white"
                    : "bg-surface border-line text-ink-mid hover:border-chili-500/60"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* products */}
        {products === null ? (
          <PageLoader label="Loading menu…" />
        ) : products.length === 0 ? (
          <p className="text-ink-faint text-sm">
            No products yet — add some from <Link href="/menu" className="underline">Menu</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {visible.map((p) => {
              const q = qtyInCart(p.id);
              const showImg = p.image_url && !brokenImgs[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="group overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:border-chili-500 active:scale-[0.98]"
                >
                  <div className="relative aspect-[16/10] bg-raised overflow-hidden">
                    {showImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url as string}
                        alt={p.name}
                        loading="lazy"
                        onError={() => setBrokenImgs((b) => ({ ...b, [p.id]: true }))}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-raised to-hover font-display text-3xl text-ink-faint">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {q > 0 && (
                      <span className="absolute right-2 top-2 grid min-w-[22px] h-[22px] place-items-center rounded-full bg-chili-500 px-1.5 text-xs font-bold text-white shadow">
                        {q}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                    <div className="mt-1 font-mono text-sm text-basil-400">Rs {fmt(p.price)}</div>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && <p className="col-span-full text-sm text-ink-faint">Nothing in this category.</p>}
          </div>
        )}
      </div>

      {/* ================= mobile: sticky cart bar + backdrop ================= */}
      {cart.length > 0 && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-basil-500 active:bg-basil-600 px-4 py-3 text-white font-semibold"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} />
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span className="font-mono">Rs {fmt(subtotal + delivery)} · View order</span>
          </button>
        </div>
      )}
      {sheetOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSheetOpen(false)} />}

      {/* ================= RIGHT: current order (side panel on md+, bottom sheet on mobile) ================= */}
      <aside
        className={`flex flex-col border border-line bg-surface p-4 sm:p-5 transition-[transform,visibility] duration-300
          fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] rounded-t-2xl shadow-2xl
          md:static md:z-auto md:m-4 md:ml-0 md:w-[340px] md:shrink-0 md:self-start md:max-h-[calc(100dvh-2rem)] md:translate-y-0 md:rounded-2xl md:shadow-none md:visible lg:w-[370px]
          ${sheetOpen ? "translate-y-0 max-md:visible" : "translate-y-full max-md:invisible max-md:[transition-delay:0s,.3s]"}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold leading-tight">Current order</h2>
            <p className="text-xs text-ink-faint">{isResumed ? "Resumed ticket" : "New ticket"}</p>
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Close order"
            className="md:hidden grid place-items-center w-8 h-8 rounded-lg bg-raised text-ink-mid"
          >
            <X size={16} />
          </button>
        </div>

        {orderType === "dine_in" && (
          <select value={tableId} onChange={(e) => setTableId(e.target.value)} className={`${FIELD} mb-3`}>
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} ({t.seats} seats)
              </option>
            ))}
          </select>
        )}
        {orderType === "delivery" && (
          <select value={areaId} onChange={(e) => onAreaChange(e.target.value)} className={`${FIELD} mb-3`}>
            <option value="">Select area…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — Rs {a.delivery_fee}
              </option>
            ))}
          </select>
        )}

        <div className="mb-3 rounded-lg border border-line bg-raised/60 px-3 py-2.5 text-xs text-ink-faint">
          Customer info is collected at checkout.
        </div>

        <div className="flex-1 min-h-[80px] overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">Tap a product to start an order.</p>
          ) : (
            cart.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 border-b border-line-soft py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug">{l.name}</div>
                  <div className="font-mono text-[11px] text-ink-faint">Rs {fmt(l.price)} each</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => changeQty(l.productId, -1)}
                    aria-label={`Decrease ${l.name}`}
                    className="grid place-items-center w-7 h-7 rounded-md border border-line bg-raised hover:bg-hover"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{l.qty}</span>
                  <button
                    onClick={() => changeQty(l.productId, 1)}
                    aria-label={`Increase ${l.name}`}
                    className="grid place-items-center w-7 h-7 rounded-md border border-line bg-raised hover:bg-hover"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="w-[68px] text-right font-mono text-sm font-semibold">Rs {fmt(l.price * l.qty)}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 border-t border-dashed border-line pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-ink-mid">
            <span>Subtotal</span>
            <span className="font-mono">Rs {fmt(subtotal)}</span>
          </div>
          {delivery > 0 && (
            <div className="flex justify-between text-sm text-ink-mid">
              <span>Delivery</span>
              <span className="font-mono">Rs {fmt(delivery)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-mono text-base font-bold">Total (before tax)</span>
            <span className="font-mono text-lg font-bold">Rs {fmt(subtotal + delivery)}</span>
          </div>
          <p className="text-[11px] text-ink-faint">Tax and customer info are set at checkout.</p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={clearTicket}
            disabled={cart.length === 0}
            className="rounded-xl border border-line bg-raised hover:bg-hover px-4 py-3 text-sm font-semibold disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={holdCurrent}
            disabled={cart.length === 0}
            aria-label="Hold ticket"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-raised hover:bg-hover px-3 py-3 text-sm font-semibold disabled:opacity-40"
          >
            <Pause size={14} />
            Hold
          </button>
          <button
            disabled={cart.length === 0}
            onClick={() => {
              setAmountReceived(String(total));
              setError("");
              setCheckoutOpen(true);
            }}
            className="flex-1 rounded-xl bg-basil-500 hover:bg-basil-600 disabled:opacity-40 text-white font-semibold py-3"
          >
            Checkout
          </button>
        </div>
      </aside>

      {/* ================= checkout modal (same logic, restyled) ================= */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setCheckoutOpen(false);
          }}
        >
          <div className="relative w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line bg-surface p-5 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h3 className="font-display text-lg font-semibold">Payment</h3>

            <div className="rounded-lg bg-raised/60 border border-line px-3 py-2.5 space-y-1 text-sm">
              <div className="flex justify-between text-ink-mid">
                <span>Subtotal</span>
                <span className="font-mono">Rs {fmt(subtotal)}</span>
              </div>
              {delivery > 0 && (
                <div className="flex justify-between text-ink-mid">
                  <span>Delivery</span>
                  <span className="font-mono">Rs {fmt(delivery)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-mid">
                <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span className="font-mono">Rs {fmt(tax)}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-line pt-1.5 font-semibold">
                <span>Total due</span>
                <span className="font-mono">Rs {fmt(total)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-ink-faint">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg bg-raised border border-line px-3 py-2.5 mt-1 text-sm">
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
                    className={`${FIELD} mt-1`}
                  />
                  {custResults.length > 0 && (
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-line">
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
                      <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Name" className={FIELD} />
                      <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone" className={FIELD} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-ink-faint">Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`${FIELD} mt-1`}>
                {paymentMethods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-ink-faint">Amount received</label>
              <input
                type="number"
                inputMode="decimal"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className={`${FIELD} mt-1`}
              />
              {Number(amountReceived) < total && (
                <p className="text-xs text-turmeric-400 mt-1">
                  Rs {fmt(Math.max(total - (Number(amountReceived) || 0), 0))} will be left as an unpaid balance — collectable
                  later from Unpaid Orders.
                </p>
              )}
            </div>

            {error && <p className="text-crimson-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setCheckoutOpen(false)}
                disabled={submitting}
                className="flex-1 rounded-xl bg-raised hover:bg-hover border border-line py-3 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={completeSale}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-3"
              >
                {submitting && <Spinner size={14} />}
                Confirm
              </button>
            </div>
            <LoadingOverlay show={submitting} />
          </div>
        </div>
      )}
    </main>
  );
}
