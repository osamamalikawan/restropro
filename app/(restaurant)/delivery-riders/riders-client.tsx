"use client";
import { useEffect, useRef, useState } from "react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge } from "@/components/ui/panel";
import { DateRange } from "@/components/ui/date-range";
import { LoadMore } from "@/components/ui/load-more";
import { fmtDateTime, fmtMoney } from "@/lib/format";

const PAGE = 50;

type Rider = { id: string; name: string; pending_orders: number; pending_amount: number; pending_due: number; clocked_in?: boolean };
type Order = {
  id: string;
  order_no: number;
  display_id?: string | null;
  created_at: string;
  total: number;
  status: "completed" | "unpaid";
  rider_employee_id: string;
  rider_settlement_id: string | null;
  customers: { name: string; phone?: string | null; address?: string | null } | null;
  sale_payments: { method: string; amount: number }[] | null;
};
type Settlement = {
  id: string;
  rider_employee_id: string;
  rider_name: string | null;
  created_at: string;
  orders_count: number;
  orders_amount: number;
  expected_amount: number;
  submitted_amount: number;
  difference: number;
  note: string | null;
  received_by_name: string | null;
};

const paidOf = (o: Order) => (o.sale_payments ?? []).reduce((t, p) => t + Number(p.amount), 0);

/** Delivery riders: who each rider delivered for, what is still to be handed in, and the shift submissions.
 *  A delivery order is assigned from the Ticket Rail (Completed column -> "Assign rider"). At the end of the shift
 *  the rider hands in the money for all their assigned orders - "Submit shift amount" records that. */
export function DeliveryRidersClient() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loadingRiders, setLoadingRiders] = useState(true);
  const [riderId, setRiderId] = useState(""); // "" = all riders
  const [tab, setTab] = useState<"orders" | "submissions">("orders");
  const [status, setStatus] = useState<"" | "pending" | "submitted">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [totals, setTotals] = useState<{ orders: number; amount: number; due: number } | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const latest = useRef(0);

  // submit popup
  const [submitOpen, setSubmitOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const rider = riders.find((r) => r.id === riderId) ?? null;
  const riderName = (id: string) => riders.find((r) => r.id === id)?.name ?? "Rider";

  async function loadRiders() {
    try {
      const res = await fetch("/api/riders");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Could not load riders");
      else {
        setError("");
        setRiders(d.riders ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    }
    setLoadingRiders(false);
  }
  useEffect(() => {
    loadRiders();
  }, []);

  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (riderId) params.set("riderId", riderId);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    if (tab === "orders" && status) params.set("status", status);
    try {
      const res = await fetch(`/api/riders/${tab === "orders" ? "orders" : "settlements"}?${params}`);
      const d = await res.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!res.ok) return setError(d.error ?? "Could not load");
      setError("");
      setHasMore(!!d.hasMore);
      if (tab === "orders") {
        if (d.totals) setTotals(d.totals);
        setOrders((prev) => (offset === 0 ? d.orders ?? [] : [...prev, ...(d.orders ?? [])]));
      } else {
        setSettlements((prev) => (offset === 0 ? d.settlements ?? [] : [...prev, ...(d.settlements ?? [])]));
      }
    } catch {
      if (id === latest.current) setError("Could not reach the server.");
    }
  }
  function reload() {
    latest.current += 1;
    setLoading(true);
    setOrders([]);
    setSettlements([]);
    setHasMore(false);
    loadPage(0).finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, riderId, status, from, to]);

  function openSubmit() {
    if (!rider) return;
    setAmount(String(rider.pending_due));
    setNote("");
    setSubmitError("");
    setSubmitOpen(true);
  }
  async function confirmSubmit() {
    if (!rider) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0 || amount.trim() === "") return setSubmitError("Enter the amount the rider handed in (0 if nothing)");
    setSaving(true);
    setSubmitError("");
    const res = await fetch("/api/riders/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riderId: rider.id, submittedAmount: n, note: note.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setSubmitError(d.error ?? "Could not save the submission");
    setSubmitOpen(false);
    const diff = Number(d.settlement?.difference ?? 0);
    setNotice(
      `${rider.name}: ${d.settlement?.orders_count} order${d.settlement?.orders_count === 1 ? "" : "s"} submitted, ${fmtMoney(n)} received${diff < 0 ? ` - ${fmtMoney(-diff)} SHORT` : diff > 0 ? ` - ${fmtMoney(diff)} extra` : ""}.${d.warnings?.length ? " Some payments could not be recorded - check Unpaid Orders." : ""}`
    );
    await loadRiders();
    reload();
  }

  const diffNow = rider ? (Number(amount) || 0) - rider.pending_due : 0;
  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-chili-500 text-white" : "border border-line bg-raised text-ink-mid hover:text-ink-strong"}`;

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      {/* rider cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={() => setRiderId("")} className={`rounded-xl border p-4 text-left transition-colors ${riderId === "" ? "border-chili-500 bg-chili-500/10" : "border-line bg-surface hover:border-chili-500/50"}`}>
          <div className="text-sm font-semibold">All riders</div>
          <div className="mt-1 text-xs text-ink-faint">{riders.length} rider{riders.length === 1 ? "" : "s"}</div>
          <div className="mt-2 font-mono text-sm">{fmtMoney(riders.reduce((t, r) => t + r.pending_due, 0))} <span className="font-sans text-xs text-ink-faint">to hand in</span></div>
        </button>
        {riders.map((r) => (
          <button key={r.id} onClick={() => setRiderId(r.id)} className={`rounded-xl border p-4 text-left transition-colors ${riderId === r.id ? "border-chili-500 bg-chili-500/10" : "border-line bg-surface hover:border-chili-500/50"}`}>
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              {r.name}
              <span className={`text-[11px] font-semibold ${r.clocked_in === false ? "text-ink-faint" : "text-basil-400"}`}>{r.clocked_in === false ? "○ Out" : "● Clocked in"}</span>
            </div>
            <div className="mt-1 text-xs text-ink-faint">{r.pending_orders} order{r.pending_orders === 1 ? "" : "s"} waiting · {fmtMoney(r.pending_amount)}</div>
            <div className={`mt-2 font-mono text-sm ${r.pending_due > 0 ? "text-turmeric-400" : "text-ink-mid"}`}>{fmtMoney(r.pending_due)} <span className="font-sans text-xs text-ink-faint">to hand in</span></div>
          </button>
        ))}
        {!loadingRiders && riders.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-4 text-xs text-ink-mid sm:col-span-2 lg:col-span-3">
            No delivery riders yet. Open an employee under Employees, tick “Delivery rider” and save - they will appear here and in the Ticket Rail&apos;s “Assign rider” list.
          </div>
        )}
      </div>

      {notice && (
        <p className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-basil-500/30 bg-basil-500/10 px-3 py-2 text-xs text-basil-400">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="font-bold">×</button>
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={chip(tab === "orders")} onClick={() => setTab("orders")}>Completed orders</button>
        <button className={chip(tab === "submissions")} onClick={() => setTab("submissions")}>Shift submissions</button>
        {tab === "orders" && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
            {([["", "All"], ["pending", "Waiting to be submitted"], ["submitted", "Submitted"]] as const).map(([v, l]) => (
              <button key={v} className={chip(status === v)} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </>
        )}
      </div>

      <Panel loading={loading} loadingLabel="Loading…">
        <PanelHead
          title={tab === "orders" ? `${rider ? rider.name : "All riders"} - delivery orders` : `${rider ? rider.name : "All riders"} - shift submissions`}
          subtitle={tab === "orders" && totals ? `${totals.orders} order${totals.orders === 1 ? "" : "s"} · ${fmtMoney(totals.amount)} · ${fmtMoney(totals.due)} still to be handed in` : undefined}
        >
          {rider && (
            <button onClick={openSubmit} disabled={rider.pending_orders === 0} className={`${btnPrimary} disabled:opacity-40`} title={rider.pending_orders === 0 ? "No orders waiting" : "Record the money this rider hands in at the end of the shift"}>
              Submit shift amount{rider.pending_orders ? ` (${rider.pending_orders})` : ""}
            </button>
          )}
        </PanelHead>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <TableScroll>
          {tab === "orders" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Order</Th>
                  <Th>Date</Th>
                  {!riderId && <Th>Rider</Th>}
                  <Th>Customer</Th>
                  <Th>Amount</Th>
                  <Th>Payment</Th>
                  <Th>Submission</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const balance = Math.max(Number(o.total) - paidOf(o), 0);
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0">
                      <Td className="font-mono font-medium">#{o.display_id ?? o.order_no}</Td>
                      <Td className="whitespace-nowrap text-ink-mid">{fmtDateTime(o.created_at)}</Td>
                      {!riderId && <Td>{riderName(o.rider_employee_id)}</Td>}
                      <Td className="max-w-[220px] text-ink-mid">
                        <div className="truncate">{o.customers?.name || "—"}</div>
                        {o.customers?.address && <div className="truncate text-[11px] text-ink-faint">{o.customers.address}</div>}
                      </Td>
                      <Td className="whitespace-nowrap font-mono font-medium">{fmtMoney(o.total)}</Td>
                      <Td>{o.status === "unpaid" && balance > 0 ? <Badge tone="turmeric">{fmtMoney(balance)} due</Badge> : <Badge tone="basil">Paid</Badge>}</Td>
                      <Td>{o.rider_settlement_id ? <Badge tone="basil">Submitted</Badge> : <Badge tone="steel">Waiting</Badge>}</Td>
                    </tr>
                  );
                })}
                {!loading && orders.length === 0 && <EmptyRow colSpan={riderId ? 6 : 7} label="No delivery orders yet - assign them to a rider from the Ticket Rail (Completed column)." />}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Submitted</Th>
                  {!riderId && <Th>Rider</Th>}
                  <Th>Orders</Th>
                  <Th>Order value</Th>
                  <Th>Expected cash</Th>
                  <Th>Handed in</Th>
                  <Th>Difference</Th>
                  <Th>Received by</Th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <Td className="whitespace-nowrap text-ink-mid">{fmtDateTime(s.created_at)}{s.note && <div className="text-[11px] text-ink-faint">{s.note}</div>}</Td>
                    {!riderId && <Td>{s.rider_name || riderName(s.rider_employee_id)}</Td>}
                    <Td className="font-mono">{s.orders_count}</Td>
                    <Td className="whitespace-nowrap font-mono">{fmtMoney(s.orders_amount)}</Td>
                    <Td className="whitespace-nowrap font-mono">{fmtMoney(s.expected_amount)}</Td>
                    <Td className="whitespace-nowrap font-mono font-medium">{fmtMoney(s.submitted_amount)}</Td>
                    <Td className="whitespace-nowrap font-mono">
                      {Number(s.difference) === 0 ? <Badge tone="basil">Matched</Badge> : Number(s.difference) < 0 ? <Badge tone="crimson">{fmtMoney(-Number(s.difference))} short</Badge> : <Badge tone="turmeric">{fmtMoney(s.difference)} extra</Badge>}
                    </Td>
                    <Td className="text-ink-mid">{s.received_by_name || "—"}</Td>
                  </tr>
                ))}
                {!loading && settlements.length === 0 && <EmptyRow colSpan={riderId ? 7 : 8} label="No shift submissions yet." />}
              </tbody>
            </table>
          )}
        </TableScroll>
        <LoadMore hasMore={hasMore} loading={loadingMore} onMore={async () => { setLoadingMore(true); await loadPage((tab === "orders" ? orders : settlements).length); setLoadingMore(false); }} />
      </Panel>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        busy={saving}
        title={`Submit shift amount - ${rider?.name ?? ""}`}
        width="max-w-md"
        footer={
          <>
            <button onClick={() => setSubmitOpen(false)} disabled={saving} className={btnGhost}>Cancel</button>
            <button onClick={confirmSubmit} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Confirm submission"}</button>
          </>
        }
      >
        {submitError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{submitError}</p>}
        {rider && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-line bg-raised p-2.5"><div className="text-[11px] text-ink-faint">Orders</div><div className="font-mono font-semibold">{rider.pending_orders}</div></div>
              <div className="rounded-lg border border-line bg-raised p-2.5"><div className="text-[11px] text-ink-faint">Order value</div><div className="font-mono font-semibold">{fmtMoney(rider.pending_amount)}</div></div>
              <div className="rounded-lg border border-chili-500/40 bg-chili-500/10 p-2.5"><div className="text-[11px] text-ink-faint">Cash to hand in</div><div className="font-mono font-semibold">{fmtMoney(rider.pending_due)}</div></div>
            </div>
            <p className="text-xs text-ink-mid">Cash to hand in is the unpaid part of these orders (orders already paid by card or wallet owe nothing). The amount received is recorded as Cash payments on the unpaid orders, oldest first.</p>
            <Field label="Amount handed in by the rider">
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} autoFocus />
              {amount !== "" && (
                <p className={`mt-1 text-xs font-semibold ${diffNow === 0 ? "text-basil-400" : diffNow < 0 ? "text-crimson-400" : "text-turmeric-400"}`}>
                  {diffNow === 0 ? "Matches exactly" : diffNow < 0 ? `${fmtMoney(-diffNow)} short` : `${fmtMoney(diffNow)} extra`}
                </p>
              )}
            </Field>
            <Field label="Note (optional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. 200 kept for fuel" />
            </Field>
          </>
        )}
      </Modal>
    </main>
  );
}
