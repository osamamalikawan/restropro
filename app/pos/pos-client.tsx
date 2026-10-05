"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Minus, Pause, Plus, Search, ShoppingBag, X } from "lucide-react";
import { LoadingOverlay, PageLoader, Spinner } from "@/components/ui/loading";
import { ThemeToggle } from "@/components/theme-toggle";
import { readFast, pullAndCache, startBackgroundSync } from "@/lib/sync";
import { printSale, type SaleSnapshot, type SaveAction } from "@/lib/posPrint";
import { invoke } from "@tauri-apps/api/core";
import {
  getProducts,
  getTables,
  getAreas,
  getSettings,
  getPaymentMethods,
  searchCustomers as searchCustomersData,
  submitSale,
  isTauri,
} from "@/lib/posData";

type Product = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  // joined by /api/products; supabase returns an object for many-to-one, handle an array defensively
  menu_categories?: { name: string; sort_order?: number } | { name: string; sort_order?: number }[] | null;
};
type CartLine = { productId: string; name: string; price: number; qty: number; note?: string };
type Table = { id: string; number: string; seats: number };
type Area = { id: string; name: string; delivery_fee: number };
type OrderType = "dine_in" | "takeaway" | "delivery";
type Customer = { id: string; name: string; phone: string; address?: string | null; area_id?: string | null };
type PayRow = { id: number; method: string; amount: string };
type PosSettings = {
  cashTaxRate: number; // percent
  cardTaxRate: number; // percent
  fbrFee: number; // 0 unless FBR is enabled
  serviceChargeRate: number; // percent, applied to dine-in orders (Settings -> Default dine-in service charge)
  receiptTemplate: string; // classic | modern | minimal | bold
  fbr: { enabled: boolean; ntn: string; strn: string; posId: string } | null;
  showKitchenPrint: boolean;
  showPrintInvoice: boolean;
  showDiscount: boolean; // Settings -> POS controls -> Allow discounts at checkout
  notePresets: string[]; // quick-note chips for order items (Settings -> Item note shortcuts)
  receiptHeader: string;
  receiptFooter: string;
  paper: string;
};
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
const categoryOrderOf = (p: Product) => {
  const mc = p.menu_categories;
  const o = Array.isArray(mc) ? mc[0]?.sort_order : mc?.sort_order;
  return typeof o === "number" ? o : Number.MAX_SAFE_INTEGER;
};
const TYPE_TAG: Record<OrderType, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery" };
const LABEL = "block text-[11px] font-bold uppercase tracking-wide text-ink-faint";
// FIELD_BASE has no width so a caller can pick w-full / w-28 / flex-1 without the two fighting in CSS
const FIELD_BASE =
  "min-w-0 rounded-lg bg-raised border border-line px-3 py-2.5 text-sm outline-none focus:border-chili-500 transition-colors";
const FIELD = `w-full ${FIELD_BASE}`;

/** Themed select: native control (keeps mobile pickers) with the OS arrow replaced by ours. */
function SelectField({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select {...props} className={`rp-select ${FIELD_BASE} w-full cursor-pointer appearance-none pr-9 disabled:opacity-60`}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
    </div>
  );
}

// Scoped to the POS (kept here so no global stylesheet / other page is touched). Uses the theme
// tokens, so it follows light/dark automatically.
const POS_CSS = `
.rp-scroll{scrollbar-width:thin;scrollbar-color:rgb(var(--line)) transparent}
.rp-scroll::-webkit-scrollbar{width:10px;height:10px}
.rp-scroll::-webkit-scrollbar-track{background:transparent}
.rp-scroll::-webkit-scrollbar-thumb{background:rgb(var(--line));border-radius:999px;border:3px solid transparent;background-clip:content-box}
.rp-scroll::-webkit-scrollbar-thumb:hover{background:rgb(var(--ink-faint));background-clip:content-box;border:3px solid transparent}
.rp-select option{background:rgb(var(--bg-surface));color:rgb(var(--ink-strong))}
`;

export function PosClient({
  restaurantId,
  restaurantName,
  cashierName,
  withShell = false,
}: {
  restaurantId: string;
  restaurantName: string;
  cashierName: string;
  /** true when rendered inside the dashboard shell (sidebar + topbar) — the shell already
   *  provides the header/back navigation, so the POS drops its own top bar and fits under it. */
  withShell?: boolean;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [settings, setSettings] = useState<PosSettings>({
    cashTaxRate: 5,
    cardTaxRate: 5,
    fbrFee: 0,
    serviceChargeRate: 0,
    receiptTemplate: "classic",
    fbr: null,
    showKitchenPrint: true,
    showPrintInvoice: true,
    showDiscount: true,
    notePresets: [],
    receiptHeader: "",
    receiptFooter: "",
    paper: "80",
  }); // replaced with the tenant's real values once Settings loads
  const [profile, setProfile] = useState({ address: "", phone: "" });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [tableId, setTableId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["Cash"]);
  const [payRows, setPayRows] = useState<PayRow[]>([{ id: 1, method: "Cash", amount: "" }]);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountInput, setDiscountInput] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null); // productId whose note popup is open
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<SaveAction | null>(null);
  const [printNote, setPrintNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orderNo: number | string; total: number; balance: number; offline?: boolean } | null>(null);
  const saleIdRef = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
  const [error, setError] = useState("");

  // UI-only state (no effect on checkout payload)
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // mobile order sheet
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [heldLoaded, setHeldLoaded] = useState(false);
  const [isResumed, setIsResumed] = useState(false);
  const [brokenImgs, setBrokenImgs] = useState<Record<string, true>>({});

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};

    if (isTauri()) {
      // Desktop: the local database (filled by the Rust sync) is the only source. Re-read it
      // periodically so a sync that finishes while the screen is open shows up without a reload.
      const loadLocal = async () => {
        const [p, t, a] = await Promise.all([getProducts(), getTables(), getAreas()]);
        if (cancelled) return;
        setProducts(p);
        setTables(t.filter((x: any) => x.is_active !== false));
        setAreas(a.filter((x: any) => x.is_active !== false));
      };
      loadLocal().catch(() => {});
      const timer = setInterval(() => loadLocal().catch(() => {}), 20_000);
      stop = () => clearInterval(timer);
    } else {
      (async () => {
        const local = await readFast<Product>("products", restaurantId);
        if (!cancelled) setProducts(local);
        await pullAndCache("products", restaurantId);
        const refreshed = await readFast<Product>("products", restaurantId);
        if (!cancelled) setProducts(refreshed);
      })();
      stop = startBackgroundSync("products", restaurantId);
      getTables().then((t) => !cancelled && setTables(t)).catch(() => {});
      getAreas().then((a) => !cancelled && setAreas(a.filter((x: any) => x.is_active !== false))).catch(() => {});
    }

    // Settings, payment methods and (on desktop) tables/areas are re-read regularly, so a change made
    // on the Settings page shows up here without reloading the POS.
    const loadSettings = () =>
      getSettings().then((d) => {
        if (cancelled) return;
        const st = d.settings ?? {};
        const legacy = st.tax_rate != null ? Number(st.tax_rate) : 5; // older tenants only have a single tax_rate
        setSettings({
          cashTaxRate: st.cash_tax_rate != null ? Number(st.cash_tax_rate) : legacy,
          cardTaxRate: st.card_tax_rate != null ? Number(st.card_tax_rate) : legacy,
          fbrFee: st.fbr_enabled ? Number(st.fbr_fee) || 0 : 0,
          serviceChargeRate: Number(st.service_charge_rate) || 0,
          receiptTemplate: String(st.receipt_template ?? "classic"),
          fbr: st.fbr_enabled
            ? { enabled: true, ntn: st.fbr_ntn ?? "", strn: st.fbr_strn ?? "", posId: st.fbr_pos_id ?? "" }
            : null,
          showKitchenPrint: st.pos_show_kitchen_print !== false,
          showPrintInvoice: st.pos_show_print_invoice !== false,
          showDiscount: st.show_discount !== false,
          notePresets: Array.isArray(st.note_presets) ? st.note_presets.filter((x: unknown) => typeof x === "string") : [],
          receiptHeader: st.receipt_header ?? "",
          receiptFooter: st.receipt_footer ?? "",
          paper: String(st.paper_width ?? "80"),
        });
        setProfile({ address: d.restaurant?.address ?? "", phone: d.restaurant?.phone ?? "" });
      });
    let methodsInit = false;
    const loadMethods = () =>
      getPaymentMethods().then((methods) => {
        if (cancelled) return;
        const names = methods.map((m) => m.name);
        if (!names.length) return;
        setPaymentMethods((prev) => (prev.join("|") === names.join("|") ? prev : names));
        if (!methodsInit) {
          methodsInit = true; // first load: the first payment row starts on the first method in the owner's order
          setPayRows([{ id: 1, method: names[0], amount: "" }]);
        }
      });
    const refreshSettings = () => {
      loadSettings().catch(() => {});
      loadMethods().catch(() => {});
    };
    refreshSettings();
    const settingsTimer = isTauri() ? setInterval(refreshSettings, 20_000) : null;
    window.addEventListener("focus", refreshSettings);

    return () => {
      cancelled = true;
      stop();
      if (settingsTimer) clearInterval(settingsTimer);
      window.removeEventListener("focus", refreshSettings);
    };
  }, [restaurantId]);

  // "/" jumps to the search box (like most POS / admin tools)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  function openNote(productId: string) {
    setNoteFor(productId);
    setNoteDraft(cart.find((l) => l.productId === productId)?.note ?? "");
  }
  function togglePreset(text: string) {
    setNoteDraft((d) => {
      const parts = d.split(",").map((x) => x.trim()).filter(Boolean);
      const has = parts.some((x) => x.toLowerCase() === text.toLowerCase());
      return (has ? parts.filter((x) => x.toLowerCase() !== text.toLowerCase()) : [...parts, text]).join(", ");
    });
  }
  function saveNote() {
    const text = noteDraft.trim().slice(0, 300);
    setCart((prev) => prev.map((l) => (l.productId === noteFor ? { ...l, note: text || undefined } : l)));
    setNoteFor(null);
  }

  function selectOrderType(t: OrderType) {
    setOrderType(t);
    if (t !== "dine_in") setTableId("");
    if (t !== "delivery") {
      setAreaId("");
      setDeliveryCharge(0);
    } else if (!isTauri()) {
      // pick up areas added in Settings since the POS was opened
      getAreas()
        .then((a) => setAreas(a.filter((x: any) => x.is_active !== false)))
        .catch(() => {});
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
    try {
      setCustResults(await searchCustomersData(q));
    } catch {
      /* keep the previous results */
    }
  }
  function selectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setCustName(c.name ?? "");
    setCustPhone(c.phone ?? "");
    setCustAddress(c.address ?? "");
    setCustResults([]);
    setCustSearch("");
    // a delivery order picks up the customer's saved area (and its fee)
    if (orderType === "delivery" && c.area_id && areas.some((a) => a.id === c.area_id)) onAreaChange(c.area_id);
  }
  // Detach the saved customer (the small "Clear" link next to the name) to enter someone else.
  function clearCustomer() {
    setSelectedCustomer(null);
    setCustName("");
    setCustPhone("");
    setCustAddress("");
    setCustResults([]);
    setCustSearch("");
  }
  // Editing the fields of a SELECTED customer changes that customer: the new details are saved to
  // the customer record when the sale is made (see customerUpdate below).
  function editCust(setter: (v: string) => void, v: string) {
    setter(v);
  }

  function updatePayRow(id: number, patch: Partial<PayRow>) {
    setPayRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addPayRow() {
    setPayRows((rows) => {
      const unused = paymentMethods.find((m) => !rows.some((r) => r.method === m)) ?? paymentMethods[0] ?? "Cash";
      return [...rows, { id: Date.now(), method: unused, amount: "" }];
    });
  }
  function removePayRow(id: number) {
    setPayRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const delivery = orderType === "delivery" ? deliveryCharge : 0;
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  // Tax follows how the customer pays: the method carrying the most money decides cash vs card rate.
  const primaryMethod = (() => {
    const paidRows = payRows.filter((r) => Number(r.amount) > 0).sort((a, b) => Number(b.amount) - Number(a.amount));
    return (paidRows[0] ?? payRows[0])?.method ?? "Cash";
  })();
  const isCash = /cash/i.test(primaryMethod);
  const taxPct = isCash ? settings.cashTaxRate : settings.cardTaxRate;
  const taxLabel = `${isCash ? "Cash" : "Card"} tax (${taxPct}%)`;
  // Discount comes off the item subtotal BEFORE tax and service charge.
  const discountRaw = settings.showDiscount ? Math.max(0, Number(discountInput) || 0) : 0;
  const discount =
    discountMode === "percent"
      ? Math.round((subtotal * Math.min(100, discountRaw)) / 100)
      : Math.min(Math.round(discountRaw), subtotal);
  const discountPercent = subtotal > 0 ? Math.round((discount / subtotal) * 10000) / 100 : 0;
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * taxPct) / 100);
  const fee = settings.fbrFee;
  // Default dine-in service charge (Settings -> Restaurant profile), on the discounted item subtotal.
  const serviceCharge = orderType === "dine_in" ? Math.round((taxable * settings.serviceChargeRate) / 100) : 0;
  const serviceLabel = `Service charge (${settings.serviceChargeRate}%)`;
  const total = taxable + tax + delivery + fee + serviceCharge;
  const paid = payRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = total - paid;

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
    return sub + (t.orderType === "delivery" ? t.deliveryCharge : 0); // before tax — tax depends on how it gets paid
  }

  async function completeSale(action: SaveAction) {
    if (orderType === "dine_in" && !tableId) {
      setError("Select a table first");
      return;
    }
    if (orderType === "delivery" && !areaId) {
      setError("Select a delivery area first");
      return;
    }
    if (payRows.some((r) => r.amount !== "" && (Number.isNaN(Number(r.amount)) || Number(r.amount) < 0))) {
      setError("Enter valid payment amounts");
      return;
    }
    const payments = payRows.map((r) => ({ method: r.method, amount: Number(r.amount) || 0 })).filter((x) => x.amount > 0);
    const tb = tables.find((x) => x.id === tableId);
    const snap: SaleSnapshot = {
      restaurantName,
      address: profile.address,
      phone: profile.phone,
      header: settings.receiptHeader,
      footer: settings.receiptFooter,
      paper: settings.paper,
      cashier: cashierName,
      orderTypeLabel: orderType === "dine_in" ? (tb ? `Dine in - Table ${tb.number}` : "Dine in") : TYPE_TAG[orderType],
      customerName: custName.trim(),
      customerPhone: custPhone.trim(),
      items: cart.map((l) => ({ name: l.name, price: l.price, qty: l.qty, note: l.note })),
      orderNote: orderNote.trim(),
      deliveryAddress: orderType === "delivery" ? custAddress.trim() : "",
      deliveryArea: orderType === "delivery" ? areas.find((a) => a.id === areaId)?.name ?? "" : "",
      discount,
      subtotal,
      delivery,
      taxLabel,
      tax,
      fee,
      serviceCharge,
      serviceLabel,
      total,
      payments,
      template: settings.receiptTemplate,
      fbr: settings.fbr,
    };
    setSubmitting(true);
    setPendingAction(action);
    setError("");
    const paidNow = payments.reduce((sum, x) => sum + x.amount, 0);
    // An existing customer whose name / phone / address / area was edited here is updated in the database.
    const areaForCustomer = orderType === "delivery" && areaId ? areaId : undefined;
    const customerUpdate =
      selectedCustomer &&
      (custName.trim() !== (selectedCustomer.name ?? "") ||
        custPhone.trim() !== (selectedCustomer.phone ?? "") ||
        custAddress.trim() !== (selectedCustomer.address ?? "") ||
        (areaForCustomer !== undefined && areaForCustomer !== (selectedCustomer.area_id ?? undefined)))
        ? { name: custName.trim(), phone: custPhone.trim(), address: custAddress.trim(), areaId: areaForCustomer }
        : undefined;
    const result = await submitSale(
      {
        clientSaleId: saleIdRef.current,
        orderType,
        items: cart.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })),
        payments,
        tableId: tableId || null,
        areaId: areaId || null,
        deliveryCharge: delivery,
        taxMethod: primaryMethod, // server picks the cash/card rate from this (same rule as the popup)
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer ? undefined : custName.trim() || undefined,
        customerPhone: selectedCustomer ? undefined : custPhone.trim() || undefined,
        customerAddress: custAddress.trim() || undefined,
        serviceCharge,
        fbrFee: fee,
        customerUpdate,
        discount,
        discountPercent,
        orderNote: orderNote.trim() || undefined,
        itemNotes: cart.filter((l) => l.note).map((l) => ({ productId: l.productId, name: l.name, note: l.note })),
      },
      total,
      paidNow
    );
    if (!result.ok) {
      setSubmitting(false);
      setPendingAction(null);
      setError(result.error || "Checkout failed");
      return;
    }
    saleIdRef.current = crypto.randomUUID(); // next sale gets a fresh id; a failed attempt above keeps its id so a retry can't double-post
    const data = { orderNo: result.orderNo ?? "", total: result.total ?? total, balance: result.balance ?? 0, offline: !!result.offline };

    // The sale is saved at this point. Close the checkout straight away; printing happens after, and
    // a printer problem must never undo or block the sale.
    setPrintNote("");
    setSubmitting(false);
    setPendingAction(null);
    setLastReceipt({ orderNo: data.orderNo, total: data.total, balance: data.balance ?? 0, offline: data.offline });
    setCart([]);
    setIsResumed(false);
    setCheckoutOpen(false);
    setSheetOpen(false);
    setOrderNote("");
    setDiscountInput("");
    setDiscountMode("amount");
    clearCustomer(); // next sale starts with no customer selected
    setPayRows([{ id: 1, method: paymentMethods[0] ?? "Cash", amount: "" }]);

    if (action !== "save") {
      try {
        await printSale(action, snap, data.orderNo);
      } catch (e) {
        setPrintNote(
          `Sale saved, but the ${action === "kitchen" ? "kitchen slip" : "invoice"} didn't print: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  const ORDER_TYPES: { id: OrderType; label: string; icon: string }[] = [
    { id: "dine_in", label: "Dine In", icon: "🍽" },
    { id: "takeaway", label: "Takeaway", icon: "🥡" },
    { id: "delivery", label: "Delivery", icon: "🛵" },
  ];

  const available = useMemo(() => (products ?? []).filter((p) => p.is_available !== false), [products]);
  const categories = useMemo(() => {
    // Same order as Menu -> Menu categories (falls back to A-Z for a category without an order yet).
    const order = new Map<string, number>();
    for (const p of available) {
      const n = categoryOf(p);
      order.set(n, Math.min(order.get(n) ?? Number.MAX_SAFE_INTEGER, categoryOrderOf(p)));
    }
    const names = Array.from(order.keys());
    names.sort((a, b) =>
      a === "Other" ? 1 : b === "Other" ? -1 : (order.get(a)! - order.get(b)!) || a.localeCompare(b)
    );
    return names;
  }, [available]);
  const q = search.trim().toLowerCase();
  const visible = available.filter(
    (p) => (category === "All" || categoryOf(p) === category) && (!q || p.name.toLowerCase().includes(q))
  );
  const qtyInCart = (id: string) => cart.find((l) => l.productId === id)?.qty ?? 0;

  return (
    <main
      className={`${
        withShell ? "h-[calc(100dvh-4rem)]" : "h-[100dvh]"
      } bg-canvas text-ink-strong flex flex-col md:flex-row overflow-hidden`}
    >
      <style>{POS_CSS}</style>
      {/* ================= LEFT: menu ================= */}
      <div className="rp-scroll flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-5 pb-24 md:pb-5">
        {/* top bar (standalone/desktop-app mode only — inside the shell the header provides this) */}
        {!withShell && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {isTauri() ? (
              // The desktop app has no dashboard (it is not part of the offline bundle), so this
              // button signs the cashier out and returns to the PIN screen instead.
              <button
                type="button"
                aria-label="Switch cashier"
                title="Switch cashier"
                onClick={async () => {
                  try {
                    await invoke("staff_logout");
                  } catch {
                    /* still go back to the PIN screen */
                  }
                  window.location.href = "/login/staff";
                }}
                className="shrink-0 grid place-items-center w-9 h-9 rounded-lg border border-line bg-surface text-ink-mid hover:text-ink-strong hover:border-chili-500 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <Link
                href="/dashboard"
                aria-label="Back to dashboard"
                className="shrink-0 grid place-items-center w-9 h-9 rounded-lg border border-line bg-surface text-ink-mid hover:text-ink-strong hover:border-chili-500 transition-colors"
              >
                <ArrowLeft size={16} />
              </Link>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight truncate">{restaurantName} — POS</h1>
              <p className="text-ink-faint text-xs truncate">Cashier: {cashierName}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        )}


        {/* last sale banner */}
        {lastReceipt && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-basil-500/40 bg-basil-500/10 px-4 py-2.5 text-sm text-basil-400">
            <span>
              <span>
                Order #{lastReceipt.orderNo} {lastReceipt.balance > 0 ? "saved" : "completed"} — Rs {fmt(lastReceipt.total)}
                {lastReceipt.balance > 0 && ` (Rs ${fmt(lastReceipt.balance)} still due)`}
                {lastReceipt.offline && " — saved on this device, uploads when online"}
              </span>
              {printNote && <span className="block mt-0.5 text-turmeric-400">{printNote}</span>}
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

        {/* search */}
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
              // Enter on a single match adds it straight to the cart — fast for regulars
              if (e.key === "Enter" && visible.length === 1) {
                addToCart(visible[0]);
                setSearch("");
              }
            }}
            placeholder="Search menu…  ( / )"
            aria-label="Search menu"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-chili-500"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:text-ink-strong"
            >
              <X size={14} />
            </button>
          )}
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
            {visible.length === 0 && (
              <p className="col-span-full text-sm text-ink-faint">
                {q ? `No items match “${search.trim()}”.` : "Nothing in this category."}
              </p>
            )}
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
          md:static md:z-auto md:m-0 md:max-h-none md:w-[340px] md:shrink-0 md:translate-y-0 md:rounded-none md:border-y-0 md:border-r-0 md:shadow-none md:visible lg:w-[370px]
          ${sheetOpen ? "translate-y-0 max-md:visible" : "translate-y-full max-md:invisible max-md:[transition-delay:0s,.3s]"}`}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-2">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => selectOrderType(t.id)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
                  orderType === t.id
                    ? "bg-chili-500/15 border-chili-500 text-chili-400"
                    : "bg-raised border-line text-ink-mid hover:border-chili-500/60"
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Close order"
            className="md:hidden grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-ink-mid"
          >
            <X size={16} />
          </button>
        </div>

        {orderType === "dine_in" && (
          <SelectField value={tableId} onChange={(e) => setTableId(e.target.value)} className="mb-3">
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} ({t.seats} seats)
              </option>
            ))}
          </SelectField>
        )}

        <div className="rp-scroll flex-1 min-h-[80px] overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">Tap a product to start an order.</p>
          ) : (
            cart.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 border-b border-line-soft py-3 last:border-b-0">
                <button type="button" onClick={() => openNote(l.productId)} className="min-w-0 flex-1 text-left" title="Tap to add a note">
                  <div className="text-sm font-semibold leading-snug">{l.name}</div>
                  <div className="font-mono text-[11px] text-ink-faint">Rs {fmt(l.price)} each</div>
                  {l.note ? (
                    <div className="mt-0.5 text-[11px] italic leading-snug text-turmeric-400">{l.note}</div>
                  ) : (
                    <div className="mt-0.5 text-[11px] text-ink-faint/70">+ add note</div>
                  )}
                </button>
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
          {serviceCharge > 0 && (
            <div className="flex justify-between text-sm text-ink-mid">
              <span>{serviceLabel}</span>
              <span className="font-mono">Rs {fmt(serviceCharge)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-mono text-base font-bold">Total (before tax)</span>
            <span className="font-mono text-lg font-bold">Rs {fmt(subtotal + delivery + serviceCharge)}</span>
          </div>
          <p className="text-[11px] text-ink-faint">
            {orderType === "delivery" ? "Delivery area, tax and customer info are set at checkout." : "Tax and customer info are set at checkout."}
          </p>
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
              setPayRows([{ id: 1, method: paymentMethods[0] ?? "Cash", amount: "" }]);
              setError("");
              setCheckoutOpen(true);
            }}
            className="flex-1 rounded-xl bg-basil-500 hover:bg-basil-600 disabled:opacity-40 text-white font-semibold py-3"
          >
            Checkout
          </button>
        </div>
      </aside>

      {/* ================= item note popup ================= */}
      {noteFor && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setNoteFor(null)}
        >
          <div className="w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{cart.find((l) => l.productId === noteFor)?.name ?? "Item note"}</h3>
              <button
                onClick={() => setNoteFor(null)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-raised text-ink-mid hover:text-ink-strong"
              >
                <X size={16} />
              </button>
            </div>
            {settings.notePresets.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {settings.notePresets.map((t) => {
                  const on = noteDraft.split(",").some((x) => x.trim().toLowerCase() === t.toLowerCase());
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => togglePreset(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        on ? "border-chili-500 bg-chili-500/15 text-chili-400" : "border-line bg-raised text-ink-mid hover:border-chili-500/60"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              maxLength={300}
              autoFocus
              placeholder="Type a note for the kitchen…"
              className={`${FIELD} mt-4 resize-none`}
            />
            <div className="mt-4 flex justify-end gap-2">
              {noteDraft && (
                <button
                  type="button"
                  onClick={() => setNoteDraft("")}
                  className="rounded-xl border border-line bg-raised px-4 py-2.5 text-sm font-semibold hover:bg-hover"
                >
                  Clear
                </button>
              )}
              <button type="button" onClick={saveNote} className="rounded-xl bg-basil-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-basil-600">
                Save note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= checkout modal ================= */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setCheckoutOpen(false);
          }}
        >
          <div className="relative flex w-full sm:max-w-[820px] max-h-[94dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="font-display text-lg font-semibold">Checkout</h3>
                <p className="text-xs text-ink-faint">
                  {orderType === "dine_in"
                    ? `Dine in${tables.find((t) => t.id === tableId) ? ` · Table ${tables.find((t) => t.id === tableId)!.number}` : ""}`
                    : TYPE_TAG[orderType]}
                  {" · "}
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => !submitting && setCheckoutOpen(false)}
                aria-label="Close checkout"
                className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-raised text-ink-mid hover:text-ink-strong"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rp-scroll flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              <div className="grid gap-6 md:grid-cols-2">
                {/* ---------- left: customer + instructions ---------- */}
                <div className="space-y-4 min-w-0">
                  <div>
                    <label className={LABEL}>Customer</label>
                    <div className="relative mt-2">
                      <input
                        value={custSearch}
                        onChange={(e) => searchCustomers(e.target.value)}
                        placeholder="Search by name or phone…"
                        className={FIELD}
                      />
                      {custResults.length > 0 && (
                        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-line bg-surface shadow-xl">
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
                    </div>
                    {selectedCustomer && (
                      <p className="mt-2 flex items-center justify-between text-xs text-ink-mid">
                        <span>
                          Saved customer: <span className="font-semibold text-ink-strong">{selectedCustomer.name}</span>. Changes you make below are saved to
                          their record.
                        </span>
                        <button type="button" onClick={clearCustomer} className="ml-3 shrink-0 underline hover:text-ink-strong">
                          Clear
                        </button>
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 [&>div]:min-w-0">
                      <div>
                        <label className={LABEL}>Name</label>
                        <input
                          value={custName}
                          onChange={(e) => editCust(setCustName, e.target.value)}
                          placeholder="Walk-in"
                          className={`${FIELD} mt-1.5`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Phone (unique)</label>
                        <input
                          value={custPhone}
                          onChange={(e) => editCust(setCustPhone, e.target.value)}
                          inputMode="tel"
                          placeholder="03xx-xxxxxxx"
                          className={`${FIELD} mt-1.5`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Address</label>
                        <input
                          value={custAddress}
                          onChange={(e) => setCustAddress(e.target.value)}
                          placeholder="House / street"
                          className={`${FIELD} mt-1.5`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Delivery area</label>
                        {orderType !== "delivery" ? (
                          <div className={`${FIELD} mt-1.5 flex items-center text-ink-mid`} title="Only for delivery orders">
                            —
                          </div>
                        ) : (
                          <SelectField value={areaId} onChange={(e) => onAreaChange(e.target.value)} className="mt-1.5">
                            <option value="">Select delivery area…</option>
                            {areas.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} — Rs {a.delivery_fee}
                              </option>
                            ))}
                          </SelectField>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>Order instructions</label>
                    <textarea
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Anything the kitchen or rider should know about this order…"
                      className={`${FIELD} mt-1.5 resize-none`}
                    />
                  </div>
                </div>

                {/* ---------- right: totals, discount, payment ---------- */}
                <div className="space-y-4 min-w-0">
                  <div className="rounded-xl border border-line bg-raised/40 p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-ink-mid">
                      <span>Subtotal</span>
                      <span>Rs {fmt(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-basil-400">
                        <span>Discount{discountMode === "percent" ? ` (${discountRaw}%)` : ""}</span>
                        <span>- Rs {fmt(discount)}</span>
                      </div>
                    )}
                    {delivery > 0 && (
                      <div className="flex justify-between text-ink-mid">
                        <span>Delivery</span>
                        <span>Rs {fmt(delivery)}</span>
                      </div>
                    )}
                    {serviceCharge > 0 && (
                      <div className="flex justify-between text-ink-mid">
                        <span>{serviceLabel}</span>
                        <span>Rs {fmt(serviceCharge)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-ink-mid">
                      <span>{taxLabel}</span>
                      <span>Rs {fmt(tax)}</span>
                    </div>
                    {fee > 0 && (
                      <div className="flex justify-between text-ink-mid">
                        <span>FBR invoicing fee</span>
                        <span>Rs {fmt(fee)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t border-dashed border-line pt-2.5">
                      <span className="font-mono text-base font-bold">Total due</span>
                      <span className="font-mono text-xl font-bold">Rs {fmt(total)}</span>
                    </div>
                  </div>

                  {settings.showDiscount && (
                    <div>
                      <label className={LABEL}>Discount</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line text-xs font-bold">
                          {(["amount", "percent"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setDiscountMode(m)}
                              className={`px-3 py-2.5 ${discountMode === m ? "bg-chili-500 text-white" : "bg-raised text-ink-mid hover:bg-hover"}`}
                            >
                              {m === "amount" ? "Rs" : "%"}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={discountInput}
                          placeholder="0"
                          onChange={(e) => setDiscountInput(e.target.value)}
                          className={`${FIELD_BASE} flex-1`}
                        />
                        {discountInput && (
                          <button
                            type="button"
                            onClick={() => setDiscountInput("")}
                            aria-label="Remove discount"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint hover:text-crimson-400"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {discount > 0 && (
                        <p className="mt-1.5 text-xs text-ink-faint">
                          Takes Rs {fmt(discount)} ({discountPercent}%) off the items, before tax.
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className={LABEL}>Payment</label>
                    <div className="mt-2 space-y-2">
                      {payRows.map((r) => (
                        <div key={r.id} className="flex items-center gap-2">
                          <SelectField
                            value={r.method}
                            onChange={(e) => updatePayRow(r.id, { method: e.target.value })}
                            className="flex-1"
                          >
                            {paymentMethods.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </SelectField>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            value={r.amount}
                            placeholder="0"
                            onChange={(e) => updatePayRow(r.id, { amount: e.target.value })}
                            className={`${FIELD_BASE} w-28 shrink-0`}
                          />
                          {payRows.length > 1 && (
                            <button
                              onClick={() => removePayRow(r.id)}
                              aria-label="Remove payment method"
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint hover:text-crimson-400"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={addPayRow}
                        className="rounded-lg border border-line bg-raised hover:bg-hover px-3 py-2 text-xs font-bold"
                      >
                        + Add payment method
                      </button>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const last = payRows[payRows.length - 1];
                            updatePayRow(last.id, { amount: String((Number(last.amount) || 0) + remaining) });
                          }}
                          className="rounded-lg px-2 py-2 text-xs font-semibold text-basil-400 hover:underline"
                        >
                          Fill remaining
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-raised/60 px-3 py-2.5 text-sm font-semibold">
                      <span className="text-ink-mid">Received Rs {fmt(paid)}</span>
                      {remaining > 0 ? (
                        <span className="text-crimson-400">Remaining Rs {fmt(remaining)}</span>
                      ) : remaining < 0 ? (
                        <span className="text-basil-400">Return Rs {fmt(-remaining)}</span>
                      ) : (
                        <span className="text-basil-400">Paid in full</span>
                      )}
                    </div>
                    {remaining > 0 && paid > 0 && (
                      <p className="mt-1.5 text-xs text-turmeric-400">The rest is left as an unpaid balance (see Unpaid Orders).</p>
                    )}
                  </div>
                </div>
              </div>

              {error && <p className="mt-4 text-crimson-400 text-sm">{error}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {settings.showKitchenPrint && (
                <button
                  onClick={() => completeSale("kitchen")}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-raised hover:bg-hover px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  {pendingAction === "kitchen" ? <Spinner size={14} /> : <span aria-hidden>🧑‍🍳</span>}
                  Kitchen Print
                </button>
              )}
              {settings.showPrintInvoice && (
                <button
                  onClick={() => completeSale("invoice")}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-raised hover:bg-hover px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  {pendingAction === "invoice" ? <Spinner size={14} /> : <span aria-hidden>🧾</span>}
                  Print Invoice
                </button>
              )}
              <button
                onClick={() => completeSale("save")}
                disabled={submitting}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-basil-500 hover:bg-basil-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {pendingAction === "save" && <Spinner size={14} />}
                Save
              </button>
            </div>
            <LoadingOverlay show={submitting} />
          </div>
        </div>
      )}
    </main>
  );
}
