"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Bike, CheckCheck, ChevronLeft, ChevronRight, Printer, Wallet, X } from "lucide-react";
import { LoadingOverlay, PageLoader } from "@/components/ui/loading";
import { printSale, type SaleSnapshot } from "@/lib/posPrint";
import { isOrderSoundOn, playOrderChime, primeOrderSound, setOrderSoundOn } from "@/lib/order-alert";
import { Modal, btnGhost, btnPrimary } from "@/components/ui/modal";
import { fmtMoney } from "@/lib/format";
import { CancelOrderDialog, stageOf } from "@/components/cancel-order-dialog";

type Kitchen = "New" | "Preparing" | "Completed";
type OrderType = "dine_in" | "takeaway" | "delivery";

type Sale = {
  id: string;
  order_no: number;
  display_id?: string | null;
  order_note?: string | null;
  item_notes?: { productId: string; name: string; note: string }[] | null;
  order_type: OrderType;
  status: "completed" | "unpaid" | "cancelled";
  kitchen_status: Kitchen;
  delivery_charge: number;
  created_at: string;
  kitchen_status_at?: string | null;
  rider_employee_id?: string | null; // delivery orders: the rider they are assigned to (migration 0025)
  rider_settlement_id?: string | null; // set once the rider handed in the money for it
  customers: { name: string; phone?: string | null; address?: string | null } | null;
  area_id?: string | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  service_charge?: number | null;
  fbr_fee?: number | null;
  discount_amount?: number | null;
  sale_payments?: { method: string; amount: number }[] | null;
  employees: { name: string } | null;
  tables: { number: string } | null;
  sale_items: { product_id: string; name: string; unit_price: number; quantity: number }[];
};

// A cart the POS parked with "Hold" (still open for more items). Lives in this browser's
// localStorage — same key/shape the POS writes (see app/pos/pos-client.tsx).
type Held = {
  id: string;
  orderType: OrderType;
  tableId: string;
  cart: { productId: string; name: string; price: number; qty: number; note?: string }[];
  heldAt: number;
  kitchenAt?: number; // when it was last moved between columns
  kitchenStatus?: Kitchen;
};

type Card = { key: string; col: Kitchen; at: number; sale?: Sale; held?: Held };

const COLUMNS: { key: Kitchen; label: string; pill: string }[] = [
  { key: "New", label: "Active", pill: "bg-chili-500/20 text-chili-400" },
  { key: "Preparing", label: "Preparing", pill: "bg-turmeric-500/20 text-turmeric-400" },
  { key: "Completed", label: "Completed", pill: "bg-basil-500/20 text-basil-400" },
];
const TYPE_LABEL: Record<OrderType, string> = { dine_in: "Dine In", takeaway: "Takeaway", delivery: "Delivery" };
const BLINK_MS = 15000;
const COMPLETED_VISIBLE_MS = 60 * 60 * 1000; // a Completed ticket leaves the board after one hour

const RT_CSS = `
.rt-scroll{scrollbar-width:thin;scrollbar-color:rgb(var(--line)) transparent}
.rt-scroll::-webkit-scrollbar{width:10px}
.rt-scroll::-webkit-scrollbar-track{background:transparent}
.rt-scroll::-webkit-scrollbar-thumb{background:rgb(var(--line));border-radius:999px;border:3px solid transparent;background-clip:content-box}
@keyframes rt-blink{0%,100%{box-shadow:0 0 0 0 rgba(217,72,31,0)}50%{box-shadow:0 0 0 3px rgba(217,72,31,.6)}}
.rt-blink{animation:rt-blink 1s ease-in-out infinite;border-color:#D9481F!important}
`;

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

export function TicketRailClient({ canCancel, restaurantId }: { canCancel: boolean; restaurantId: string }) {
  const router = useRouter();
  const heldKey = `rp_pos_held_${restaurantId}`;

  const [sales, setSales] = useState<Sale[]>([]);
  const [held, setHeld] = useState<Held[]>([]);
  const [tables, setTables] = useState<{ id: string; number: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState("80");
  // receipt details for printing an invoice from here (same source the POS uses)
  const [receipt, setReceipt] = useState({ name: "", address: "", phone: "", header: "", footer: "", template: "classic", fbr: null as SaleSnapshot["fbr"] });
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  // cancel popup (a note is required for a Completed order)
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [cancelError, setCancelError] = useState("");
  // assign rider popup
  const [riders, setRiders] = useState<{ id: string; name: string; pending_orders: number; clocked_in?: boolean }[]>([]);
  const [assigning, setAssigning] = useState<Sale | null>(null);
  const [pickRider, setPickRider] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState("");
  // collect payment (split) popup
  const [collecting, setCollecting] = useState<Sale | null>(null);
  const [methods, setMethods] = useState<string[]>(["Cash"]);
  const [split, setSplit] = useState<Record<string, string>>({});
  const [collectBusy, setCollectBusy] = useState(false);
  const [collectError, setCollectError] = useState("");
  const [blink, setBlink] = useState<Record<string, true>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Kitchen | null>(null);
  const seen = useRef<Set<string> | null>(null); // null until the first load finishes, so nothing blinks on page open

  function readHeld(): Held[] {
    try {
      const raw = localStorage.getItem(heldKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function writeHeld(next: Held[]) {
    setHeld(next);
    try {
      localStorage.setItem(heldKey, JSON.stringify(next));
    } catch {}
  }

  function noteNew(keys: string[]) {
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const fresh = keys.filter((k) => !seen.current!.has(k));
    fresh.forEach((k) => seen.current!.add(k));
    if (fresh.length === 0) return;
    if (fresh.some((k) => k.startsWith("sale:")) && isOrderSoundOn()) playOrderChime(); // a new order: chime as well as blink
    setBlink((b) => ({ ...b, ...Object.fromEntries(fresh.map((k) => [k, true as const])) }));
    setTimeout(() => setBlink((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !fresh.includes(k))) as Record<string, true>), BLINK_MS);
  }

  function loadRiders() {
    fetch("/api/riders")
      .then((r) => (r.ok ? r.json() : { riders: [] }))
      .then((d) => setRiders(d.riders ?? []))
      .catch(() => {});
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setOrderSoundOn(next);
    if (next) {
      primeOrderSound();
      playOrderChime(); // so you can hear what it sounds like
    }
  }

  function openAssign(s: Sale) {
    setAssigning(s);
    setPickRider(s.rider_employee_id ?? "");
    setAssignError("");
    loadRiders();
  }
  async function saveAssign() {
    if (!assigning) return;
    setAssignBusy(true);
    setAssignError("");
    const res = await fetch("/api/sales/assign-rider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: assigning.id, riderId: pickRider || null }),
    });
    setAssignBusy(false);
    if (!res.ok) return setAssignError((await res.json().catch(() => ({}))).error ?? "Could not assign the rider");
    setAssigning(null);
    await load();
    loadRiders();
  }

  const balanceOf = (s: Sale) => Math.max((Number(s.total) || 0) - (s.sale_payments ?? []).reduce((t, p) => t + Number(p.amount), 0), 0);
  function openCollect(s: Sale) {
    setCollecting(s);
    setSplit({});
    setCollectError("");
  }
  const splitTotal = Object.values(split).reduce((t, v) => t + (Number(v) || 0), 0);
  async function saveCollect() {
    if (!collecting) return;
    const bal = balanceOf(collecting);
    const payments = Object.entries(split)
      .map(([method, v]) => ({ method, amount: Math.round((Number(v) || 0) * 100) / 100 }))
      .filter((p) => p.amount > 0);
    if (payments.length === 0) return setCollectError("Enter an amount for at least one payment method");
    if (splitTotal > bal + 0.005) return setCollectError(`That is more than the balance (${fmtMoney(bal)})`);
    setCollectBusy(true);
    setCollectError("");
    const res = await fetch("/api/sales/collect-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: collecting.id, payments }),
    });
    setCollectBusy(false);
    if (!res.ok) return setCollectError((await res.json().catch(() => ({}))).error ?? "Could not record the payment");
    setCollecting(null);
    await load();
  }

  async function load() {
    let list: Sale[] = [];
    try {
      const res = await fetch("/api/sales?limit=60");
      const data = await res.json().catch(() => ({}));
      list = res.ok ? (data.sales ?? []).filter((s: Sale) => s.status !== "cancelled") : [];
      if (res.ok) setSales(list);
    } catch {
      // No connection and nothing saved yet: keep what is on screen (held tickets still show)
      // instead of leaving the page stuck on "loading".
    }
    const h = readHeld();
    setHeld(h);
    noteNew([...list.map((s) => `sale:${s.id}`), ...h.map((t) => `held:${t.id}`)]);
    setLoading(false);
  }

  useEffect(() => {
    setSoundOn(isOrderSoundOn());
    // browsers only allow sound after the person has touched the page once: unlock it on the first click / key press
    const unlock = () => primeOrderSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    loadRiders();
    fetch("/api/payment-methods")
      .then((r) => r.json())
      .then((d) => {
        const names = (d.methods ?? []).map((m: { name: string }) => m.name);
        if (names.length) setMethods(names);
      })
      .catch(() => {});
    load();
    fetch("/api/tables").then((r) => r.json()).then((d) => setTables(d.tables ?? [])).catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.paper_width) setPaper(String(d.settings.paper_width));
        const st = d.settings ?? {};
        setReceipt({
          name: d.restaurant?.name ?? "",
          address: d.restaurant?.address ?? "",
          phone: d.restaurant?.phone ?? "",
          header: st.receipt_header ?? "",
          footer: st.receipt_footer ?? "",
          template: String(st.receipt_template ?? "classic"),
          fbr: st.fbr_enabled ? { enabled: true, ntn: st.fbr_ntn ?? "", strn: st.fbr_strn ?? "", posId: st.fbr_pos_id ?? "" } : null,
        });
      })
      .catch(() => {});
    fetch("/api/delivery-areas")
      .then((r) => r.json())
      .then((d) => setAreaNames(Object.fromEntries((d.areas ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))))
      .catch(() => {});
    const id = setInterval(load, 5000);
    const onStorage = (e: StorageEvent) => e.key === heldKey && load();
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ticket sitting in Completed for more than an hour is taken off the board (the sale itself is
  // untouched: it stays in Sales, reports and the ledger). The board refreshes every 5 seconds, so
  // this is re-checked continuously.
  const nowMs = Date.now();
  const expired = (col: Kitchen, since: number) => col === "Completed" && nowMs - since > COMPLETED_VISIBLE_MS;
  const cards: Card[] = [
    ...sales
      .filter((s) => !expired(s.kitchen_status, new Date(s.kitchen_status_at ?? s.created_at).getTime()))
      .map((s): Card => ({ key: `sale:${s.id}`, col: s.kitchen_status, at: new Date(s.created_at).getTime(), sale: s })),
    ...held
      .filter((t) => !expired(t.kitchenStatus ?? "New", t.kitchenAt ?? t.heldAt))
      .map((t): Card => ({ key: `held:${t.id}`, col: t.kitchenStatus ?? "New", at: t.heldAt, held: t })),
  ];

  const pendingCount = cards.filter((c) => c.sale && (c.col === "New" || c.col === "Preparing")).length;

  async function moveCard(card: Card, to: Kitchen) {
    if (card.col === to) return;
    if (card.held) {
      writeHeld(readHeld().map((t) => (t.id === card.held!.id ? { ...t, kitchenStatus: to, kitchenAt: Date.now() } : t)));
      return;
    }
    const saleId = card.sale!.id;
    setBusyId(saleId);
    setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, kitchen_status: to, kitchen_status_at: new Date().toISOString() } : s)));
    const res = await fetch("/api/sales/kitchen-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId, kitchenStatus: to }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Couldn't move the ticket");
      await load();
    }
    setBusyId(null);
  }

  /** "Complete all": every real order sitting in Active or Preparing goes to Completed in one go.
   *  Held tickets (carts still open for more items, not fired yet) are left alone. */
  async function completeAll() {
    const todo = cards.filter((c) => c.sale && (c.col === "New" || c.col === "Preparing")).map((c) => c.sale!);
    if (todo.length === 0) return;
    if (!confirm(`Mark ${todo.length} order${todo.length === 1 ? "" : "s"} in Active and Preparing as Completed?`)) return;
    setError("");
    setBulkBusy(true);
    const ids = new Set(todo.map((s) => s.id));
    const stamp = new Date().toISOString();
    setSales((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, kitchen_status: "Completed", kitchen_status_at: stamp } : s)));
    const results = await Promise.allSettled(
      todo.map(async (s) => {
        const res = await fetch("/api/sales/kitchen-status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ saleId: s.id, kitchenStatus: "Completed" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "failed");
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) setError(`${failed} of ${todo.length} orders couldn't be marked Completed — they are back in their old column. Try again.`);
    await load(); // brings back the real state, including any that failed
    setBulkBusy(false);
  }

  async function cancelTicket(card: Card) {
    if (card.held) {
      if (confirm("Discard this held ticket?")) writeHeld(readHeld().filter((t) => t.id !== card.held!.id));
      return;
    }
    setCancelError("");
    setCancelling(card.sale!); // the dialog asks for the reason (required once the order is Completed)
  }

  async function confirmCancel(note: string) {
    const s = cancelling;
    if (!s) return;
    setBusyId(s.id);
    setCancelError("");
    const res = await fetch("/api/sales/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: s.id, note }),
    });
    if (!res.ok) {
      setCancelError((await res.json().catch(() => ({}))).error || "Couldn't cancel the order");
      setBusyId(null);
      return;
    }
    setCancelling(null);
    await load();
    setBusyId(null);
  }

  /** Active column -> kitchen slip. Preparing / Completed -> customer invoice. */
  async function printTicket(s: Sale) {
    setError("");
    const invoice = s.kitchen_status !== "New";
    const notes = s.item_notes ?? [];
    const isDelivery = s.order_type === "delivery";
    const snap: SaleSnapshot = {
      restaurantName: invoice ? receipt.name : "",
      address: invoice ? receipt.address : "",
      phone: invoice ? receipt.phone : "",
      header: invoice ? receipt.header : "",
      footer: invoice ? receipt.footer : "",
      paper,
      cashier: s.employees?.name ?? "",
      orderTypeLabel: TYPE_LABEL[s.order_type] + (s.tables?.number ? ` - Table ${s.tables.number}` : ""),
      customerName: s.customers?.name ?? "",
      customerPhone: s.customers?.phone ?? "",
      items: s.sale_items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        price: i.unit_price,
        note: notes.find((n) => n.productId === i.product_id)?.note,
      })),
      orderNote: s.order_note ?? "",
      deliveryAddress: isDelivery ? s.customers?.address ?? "" : "",
      deliveryArea: isDelivery && s.area_id ? areaNames[s.area_id] ?? "" : "",
      discount: Number(s.discount_amount) || 0,
      subtotal: Number(s.subtotal) || 0,
      delivery: Number(s.delivery_charge) || 0,
      taxLabel: "Tax",
      tax: Number(s.tax) || 0,
      fee: Number(s.fbr_fee) || 0,
      serviceCharge: Number(s.service_charge) || 0,
      serviceLabel: "Service charge",
      total: Number(s.total) || 0,
      payments: (s.sale_payments ?? []).map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
      template: receipt.template,
      fbr: receipt.fbr,
    };
    try {
      await printSale(invoice ? "invoice" : "kitchen", snap, s.display_id ?? s.order_no);
    } catch (e) {
      setError(`${invoice ? "Invoice" : "Kitchen slip"} didn't print: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Held ticket in Active -> kitchen slip, so the kitchen can start while the guest keeps ordering. A held ticket
   *  has no order number yet, so the slip is headed with its table / order type instead. */
  async function printHeld(t: Held) {
    setError("");
    const label = heldTitle(t);
    const snap: SaleSnapshot = {
      restaurantName: "",
      address: "",
      phone: "",
      header: "",
      footer: "",
      paper,
      cashier: "",
      orderTypeLabel: t.orderType === "dine_in" ? `Dine in - ${label}` : TYPE_LABEL[t.orderType],
      customerName: "",
      customerPhone: "",
      items: t.cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price, note: i.note })),
      orderNote: "",
      subtotal: t.cart.reduce((sum, i) => sum + i.price * i.qty, 0),
      delivery: 0,
      taxLabel: "Tax",
      tax: 0,
      fee: 0,
      total: 0,
      payments: [],
      template: receipt.template,
      fbr: null,
    };
    try {
      await printSale("kitchen", snap, "HELD", label);
    } catch (e) {
      setError(`Kitchen slip didn't print: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const heldTitle = (t: Held) =>
    t.orderType === "dine_in" ? `Table ${tables.find((x) => x.id === t.tableId)?.number ?? "—"}` : TYPE_LABEL[t.orderType];

  const arrowBtn =
    "grid h-7 w-7 place-items-center rounded-md border border-line bg-canvas text-ink-mid hover:border-chili-500 hover:text-ink-strong disabled:opacity-40";
  const iconBtn =
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-ink-mid hover:border-chili-500 hover:text-ink-strong disabled:opacity-40";

  return (
    <main className="p-4 sm:p-6">
      <style>{RT_CSS}</style>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-xs text-ink-faint">
          Drag a ticket to a new column, or use the ‹ › buttons. Held dine-in tickets (still open for more items) show up
          right alongside fired orders — new tickets blink for 15 seconds.
        </p>
        <button
          onClick={toggleSound}
          title={soundOn ? "New-order sound is on - click to mute" : "New-order sound is off - click to turn on"}
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-bold transition ${soundOn ? "border-chili-500/50 bg-chili-500/10 text-chili-400 hover:bg-chili-500/20" : "border-line bg-raised text-ink-mid hover:text-ink-strong"}`}
        >
          {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
          Sound {soundOn ? "on" : "off"}
        </button>
        <button
          onClick={completeAll}
          disabled={bulkBusy || loading || pendingCount === 0}
          title="Move every order in Active and Preparing to Completed"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-basil-500/50 bg-basil-500/15 px-4 text-sm font-bold text-basil-400 transition hover:bg-basil-500/25 disabled:opacity-40 disabled:hover:bg-basil-500/15"
        >
          <CheckCheck size={16} />
          {bulkBusy ? "Completing…" : `Complete all${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-crimson-500/40 bg-crimson-500/10 px-3 py-2 text-sm text-crimson-400">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading tickets…" />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((col, colIdx) => {
            const items = cards.filter((c) => c.col === col.key).sort((a, b) => b.at - a.at);
            return (
              <section
                key={col.key}
                onDragOver={(e) => {
                  if (!dragKey) return;
                  e.preventDefault();
                  setOverCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const card = cards.find((c) => c.key === dragKey);
                  setDragKey(null);
                  setOverCol(null);
                  if (card) moveCard(card, col.key);
                }}
                className={`rounded-2xl border bg-surface transition-colors ${
                  overCol === col.key ? "border-chili-500" : "border-line"
                }`}
              >
                <header className="flex items-center justify-between border-b border-line px-5 py-4">
                  <h2 className="font-display text-base font-semibold">{col.label}</h2>
                  <span className={`grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 text-xs font-bold ${col.pill}`}>
                    {items.length}
                  </span>
                </header>

                <div className="rt-scroll min-h-[120px] space-y-3 p-3 md:max-h-[calc(100dvh-13rem)] md:overflow-y-auto">
                  {items.length === 0 && <p className="py-8 text-center text-xs text-ink-faint">No tickets here.</p>}
                  {items.map((c) => {
                    const s = c.sale;
                    const t = c.held;
                    const lines = s ? s.sale_items.map((i) => ({ q: i.quantity, n: i.name })) : t!.cart.map((i) => ({ q: i.qty, n: i.name }));
                    return (
                      <article
                        key={c.key}
                        draggable
                        onDragStart={(e) => {
                          setDragKey(c.key);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", c.key);
                        }}
                        onDragEnd={() => {
                          setDragKey(null);
                          setOverCol(null);
                        }}
                        className={`relative cursor-grab rounded-xl border border-line bg-raised p-3.5 active:cursor-grabbing ${
                          blink[c.key] ? "rt-blink" : ""
                        } ${dragKey === c.key ? "opacity-50" : ""}`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold">{s ? `#${s.display_id ?? s.order_no}` : heldTitle(t!)}</span>
                          <div className="flex items-center gap-1.5">
                            {s?.status === "unpaid" && (
                              <span className="rounded-full bg-turmeric-500/20 px-2 py-1 text-[10px] font-bold text-turmeric-400">UNPAID</span>
                            )}
                            {t ? (
                              <span className="rounded-full bg-chili-500/20 px-2.5 py-1 text-[10px] font-bold text-chili-400">
                                HELD — adding items
                              </span>
                            ) : (
                              s?.employees?.name && (
                                <span className="rounded-full bg-hover px-2.5 py-1 text-[11px] font-semibold text-ink-mid">
                                  {s.employees.name}
                                </span>
                              )
                            )}
                          </div>
                        </div>

                        {s ? (
                          <p className="text-xs font-medium text-ink-mid">
                            {TYPE_LABEL[s.order_type]}
                            {s.tables?.number && ` ${""}· Table ${s.tables.number}`}
                            {s.customers?.name && ` · ${s.customers.name}`}
                          </p>
                        ) : (
                          <p className="text-xs font-medium text-ink-mid">{TYPE_LABEL[t!.orderType]}</p>
                        )}

                        <div className="mt-2.5 space-y-0.5 text-xs text-ink-mid">
                          {lines.slice(0, 6).map((l, i) => (
                            <div key={i}>
                              {l.q}× {l.n}
                            </div>
                          ))}
                          {lines.length > 6 && <div className="text-ink-faint">+{lines.length - 6} more</div>}
                        </div>

                        {/* the order's total bill (a held ticket has no tax / charges yet, so it shows the items' subtotal) */}
                        <div className="mt-2.5 flex items-baseline justify-between rounded-md bg-canvas px-2.5 py-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{s ? "Total bill" : "Subtotal"}</span>
                          <span className="font-mono text-sm font-bold text-ink-strong">
                            {fmtMoney(s ? s.total : t!.cart.reduce((sum, i) => sum + i.price * i.qty, 0))}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-dashed border-line pt-3">
                          <span className="font-mono text-[11px] text-ink-faint">{fmtTime(c.at)}</span>
                          <div className="flex gap-1.5">
                            {colIdx > 0 && (
                              <button
                                onClick={() => moveCard(c, COLUMNS[colIdx - 1].key)}
                                disabled={!!s && busyId === s.id}
                                className={arrowBtn}
                                title="Move back"
                                aria-label="Move back"
                              >
                                <ChevronLeft size={14} />
                              </button>
                            )}
                            {colIdx < COLUMNS.length - 1 && (
                              <button
                                onClick={() => moveCard(c, COLUMNS[colIdx + 1].key)}
                                disabled={!!s && busyId === s.id}
                                className={arrowBtn}
                                title="Move forward"
                                aria-label="Move forward"
                              >
                                <ChevronRight size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          {t ? (
                            <>
                              <button
                                onClick={() => router.push(`/pos?resume=${encodeURIComponent(t.id)}`)}
                                className="h-10 flex-1 rounded-lg border border-line bg-canvas text-sm font-bold hover:border-chili-500"
                              >
                                Add items / Charge
                              </button>
                              {col.key === "New" && (
                                <button
                                  onClick={() => printHeld(t)}
                                  className={iconBtn}
                                  title="Kitchen print"
                                  aria-label="Kitchen print"
                                >
                                  <Printer size={15} />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {canCancel && (
                                <button
                                  onClick={() => router.push(`/pos?edit=${encodeURIComponent(s!.id)}`)}
                                  disabled={busyId === s!.id}
                                  className="h-10 flex-1 rounded-lg border border-line bg-canvas text-sm font-bold hover:border-chili-500 disabled:opacity-40"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => printTicket(s!)}
                                className={canCancel ? iconBtn : `${iconBtn} flex-1 w-auto`}
                                title={s!.kitchen_status === "New" ? "Print kitchen slip" : "Print invoice"}
                                aria-label={s!.kitchen_status === "New" ? "Print kitchen slip" : "Print invoice"}
                              >
                                <Printer size={15} />
                              </button>
                            </>
                          )}
                          {(canCancel || t) && (
                            <button
                              onClick={() => cancelTicket(c)}
                              disabled={!!s && busyId === s.id}
                              className={`${iconBtn} text-crimson-400 hover:border-crimson-500 hover:text-crimson-400`}
                              title={t ? "Discard held ticket" : "Cancel order"}
                              aria-label={t ? "Discard held ticket" : "Cancel order"}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        {s && (s.status === "unpaid" || (col.key === "Completed" && s.order_type === "delivery")) && (
                          <div className="mt-2 flex gap-2">
                            {s.status === "unpaid" && (
                              <button
                                onClick={() => openCollect(s)}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-turmeric-500/40 bg-turmeric-500/10 text-xs font-bold text-turmeric-400 hover:bg-turmeric-500/20"
                              >
                                <Wallet size={14} /> Collect payment · {fmtMoney(balanceOf(s))}
                              </button>
                            )}
                            {col.key === "Completed" && s.order_type === "delivery" && (
                              <button
                                onClick={() => openAssign(s)}
                                disabled={!!s.rider_settlement_id}
                                title={s.rider_settlement_id ? "The rider already handed in the money for this order" : "Assign a delivery rider"}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas text-xs font-bold hover:border-chili-500 disabled:opacity-60"
                              >
                                <Bike size={14} />
                                {s.rider_employee_id ? `Rider: ${riders.find((r) => r.id === s.rider_employee_id)?.name ?? "assigned"}` : "Assign rider"}
                              </button>
                            )}
                          </div>
                        )}
                        {s && <LoadingOverlay show={busyId === s.id} />}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <CancelOrderDialog
        open={!!cancelling}
        orderLabel={String(cancelling?.display_id ?? cancelling?.order_no ?? "")}
        stage={stageOf(cancelling?.kitchen_status)}
        busy={!!cancelling && busyId === cancelling.id}
        error={cancelError}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
      />

      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        busy={assignBusy}
        title={`Assign rider - order #${assigning?.display_id ?? assigning?.order_no ?? ""}`}
        width="max-w-sm"
        footer={
          <>
            <button onClick={() => setAssigning(null)} disabled={assignBusy} className={btnGhost}>Cancel</button>
            <button onClick={saveAssign} disabled={assignBusy || (!pickRider && !assigning?.rider_employee_id)} className={btnPrimary}>
              {assignBusy ? "Saving…" : pickRider ? "Assign" : "Remove rider"}
            </button>
          </>
        }
      >
        {assignError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{assignError}</p>}
        {riders.length === 0 ? (
          <p className="text-sm text-ink-mid">No delivery riders yet. Open an employee under Employees and tick “Delivery rider”.</p>
        ) : riders.filter((r) => r.clocked_in !== false || r.id === assigning?.rider_employee_id).length === 0 ? (
          <p className="text-sm text-ink-mid">
            No delivery rider is clocked in right now. Only riders who are clocked in can be given deliveries - mark them in on the Attendance page first.
          </p>
        ) : (
          <div className="space-y-2">
            {riders.filter((r) => r.clocked_in !== false || r.id === assigning?.rider_employee_id).map((r) => (
              <label key={r.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${pickRider === r.id ? "border-chili-500 bg-chili-500/10" : "border-line bg-raised"}`}>
                <span className="flex items-center gap-2.5">
                  <input type="radio" name="rider" checked={pickRider === r.id} onChange={() => setPickRider(r.id)} className="accent-chili-500" />
                  <span className="font-semibold">{r.name}</span>
                </span>
                <span className="text-xs text-ink-faint">{r.pending_orders} waiting</span>
              </label>
            ))}
            {pickRider && (
              <button onClick={() => setPickRider("")} className="text-xs font-semibold text-ink-mid underline hover:text-ink-strong">
                No rider (take the rider off this order)
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!collecting}
        onClose={() => setCollecting(null)}
        busy={collectBusy}
        title={`Collect payment - order #${collecting?.display_id ?? collecting?.order_no ?? ""}`}
        width="max-w-md"
        footer={
          <>
            <button onClick={() => setCollecting(null)} disabled={collectBusy} className={btnGhost}>Cancel</button>
            <button onClick={saveCollect} disabled={collectBusy || splitTotal <= 0} className={btnPrimary}>
              {collectBusy ? "Saving…" : `Collect ${fmtMoney(splitTotal)}`}
            </button>
          </>
        }
      >
        {collecting && (
          <>
            {collectError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{collectError}</p>}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-line bg-raised p-2.5"><div className="text-[11px] text-ink-faint">Order total</div><div className="font-mono font-semibold">{fmtMoney(collecting.total)}</div></div>
              <div className="rounded-lg border border-line bg-raised p-2.5"><div className="text-[11px] text-ink-faint">Already paid</div><div className="font-mono font-semibold">{fmtMoney((Number(collecting.total) || 0) - balanceOf(collecting))}</div></div>
              <div className="rounded-lg border border-turmeric-500/40 bg-turmeric-500/10 p-2.5"><div className="text-[11px] text-ink-faint">Balance due</div><div className="font-mono font-semibold">{fmtMoney(balanceOf(collecting))}</div></div>
            </div>
            <p className="text-xs text-ink-mid">Split the payment across as many methods as you need - fill in the amount for each one the customer used.</p>
            <div className="space-y-2">
              {methods.map((m) => {
                const left = Math.max(balanceOf(collecting) - (splitTotal - (Number(split[m]) || 0)), 0);
                return (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm font-semibold">{m}</span>
                    <input
                      inputMode="decimal"
                      value={split[m] ?? ""}
                      onChange={(e) => setSplit((p) => ({ ...p, [m]: e.target.value.replace(/[^\d.]/g, "") }))}
                      placeholder="0"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-sm font-mono outline-none focus:border-chili-500"
                    />
                    <button
                      type="button"
                      onClick={() => setSplit((p) => ({ ...p, [m]: left > 0 ? String(Math.round(left * 100) / 100) : "" }))}
                      className="h-10 shrink-0 rounded-lg border border-line px-2.5 text-[11px] font-bold text-ink-mid hover:border-chili-500 hover:text-ink-strong"
                      title="Put the rest of the balance on this method"
                    >
                      Rest
                    </button>
                  </div>
                );
              })}
            </div>
            <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${splitTotal > balanceOf(collecting) + 0.005 ? "border-crimson-500/40 text-crimson-400" : "border-line text-ink-mid"}`}>
              <span>Entered {fmtMoney(splitTotal)}</span>
              <span className="font-semibold">
                {splitTotal > balanceOf(collecting) + 0.005 ? "More than the balance" : balanceOf(collecting) - splitTotal <= 0.005 ? "Settles the order" : `${fmtMoney(balanceOf(collecting) - splitTotal)} will remain unpaid`}
              </span>
            </div>
          </>
        )}
      </Modal>

    </main>
  );
}
