"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer, X } from "lucide-react";
import { EditOrderModal } from "@/components/edit-order-modal";
import { LoadingOverlay, PageLoader } from "@/components/ui/loading";
import { printSale, type SaleSnapshot } from "@/lib/posPrint";

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
  cart: { productId: string; name: string; price: number; qty: number }[];
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
  const [taxRate, setTaxRate] = useState(0.05);
  const [paper, setPaper] = useState("80");
  // receipt details for printing an invoice from here (same source the POS uses)
  const [receipt, setReceipt] = useState({ name: "", address: "", phone: "", header: "", footer: "", template: "classic", fbr: null as SaleSnapshot["fbr"] });
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    setBlink((b) => ({ ...b, ...Object.fromEntries(fresh.map((k) => [k, true as const])) }));
    setTimeout(() => setBlink((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !fresh.includes(k))) as Record<string, true>), BLINK_MS);
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
    load();
    fetch("/api/tables").then((r) => r.json()).then((d) => setTables(d.tables ?? [])).catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.tax_rate != null) setTaxRate(Number(d.settings.tax_rate) / 100);
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

  async function cancelTicket(card: Card) {
    if (card.held) {
      if (confirm("Discard this held ticket?")) writeHeld(readHeld().filter((t) => t.id !== card.held!.id));
      return;
    }
    const s = card.sale!;
    if (!confirm(`Cancel order #${s.order_no}? This restores its inventory and removes it from today's income.`)) return;
    setBusyId(s.id);
    const res = await fetch("/api/sales/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: s.id }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Couldn't cancel the order");
      setBusyId(null);
      return;
    }
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

  const heldTitle = (t: Held) =>
    t.orderType === "dine_in" ? `Table ${tables.find((x) => x.id === t.tableId)?.number ?? "—"}` : TYPE_LABEL[t.orderType];

  const arrowBtn =
    "grid h-7 w-7 place-items-center rounded-md border border-line bg-canvas text-ink-mid hover:border-chili-500 hover:text-ink-strong disabled:opacity-40";
  const iconBtn =
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-ink-mid hover:border-chili-500 hover:text-ink-strong disabled:opacity-40";

  return (
    <main className="p-4 sm:p-6">
      <style>{RT_CSS}</style>
      <p className="mb-4 text-xs text-ink-faint">
        Drag a ticket to a new column, or use the ‹ › buttons. Held dine-in tickets (still open for more items) show up
        right alongside fired orders — new tickets blink for 15 seconds.
      </p>

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
                            <button
                              onClick={() => router.push(`/pos?resume=${encodeURIComponent(t.id)}`)}
                              className="h-10 flex-1 rounded-lg border border-line bg-canvas text-sm font-bold hover:border-chili-500"
                            >
                              Add items / Charge
                            </button>
                          ) : (
                            <>
                              {canCancel && (
                                <button
                                  onClick={() => setEditingSale(s!)}
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

      {editingSale && (
        <EditOrderModal
          saleId={editingSale.id}
          orderNo={editingSale.order_no}
          taxRate={taxRate}
          deliveryCharge={editingSale.delivery_charge || 0}
          initialItems={editingSale.sale_items}
          onClose={() => setEditingSale(null)}
          onSaved={() => {
            setEditingSale(null);
            load();
          }}
        />
      )}
    </main>
  );
}
