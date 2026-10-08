"use client";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, searchInputCls } from "@/components/ui/panel";
import { DateRange } from "@/components/ui/date-range";
import { LoadMore, useDebounced } from "@/components/ui/load-more";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { fmtDuration } from "@/components/clock-out-dialog";

const PAGE = 50;

type Shift = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed" | "abandoned";
  duration_minutes: number | null;
  orders_count: number | null;
  sales_amount: number | null;
  cash_amount: number | null;
  other_amount: number | null;
  other_breakdown: { method: string; amount: number }[] | null;
  unpaid_amount: number | null;
  expenses_amount: number | null;
};
type Totals = { shifts: number; orders: number; sales: number; cash: number; other: number; expenses: number };

const STATUS: Record<Shift["status"], { label: string; tone: "basil" | "turmeric" | "steel" }> = {
  closed: { label: "Clocked out", tone: "basil" },
  open: { label: "On shift", tone: "turmeric" },
  abandoned: { label: "Not clocked out", tone: "steel" },
};

/** Live length of a shift that is still open. */
const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));

/** Every clock-in / clock-out, newest first: who, when, how long, and what they took in that shift.
 *  Loads 50 at a time - the next page comes in as you scroll (or with "Load more"). */
export function ShiftRecordsClient() {
  const [rows, setRows] = useState<Shift[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useDebounced(search.trim(), 300);
  const latest = useRef(0); // ignores a slow answer that a newer filter has already replaced

  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (q) params.set("q", q);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString()); // the local day, not UTC
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    try {
      const res = await fetch(`/api/shifts?${params}`);
      const data = await res.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load shift records");
        return;
      }
      setError("");
      setHasMore(!!data.hasMore);
      if (data.totals) setTotals(data.totals);
      setRows((prev) => (offset === 0 ? data.shifts ?? [] : [...prev, ...(data.shifts ?? [])]));
    } catch {
      if (id === latest.current) setError("Could not reach the server.");
    }
  }

  useEffect(() => {
    latest.current += 1;
    setLoading(true);
    setRows([]);
    setHasMore(false);
    loadPage(0).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(rows.length);
    setLoadingMore(false);
  }

  const filtered = !!(q || from || to);

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading} loadingLabel="Loading shift records…">
        <PanelHead
          title="Shift records"
          subtitle={
            totals
              ? `${totals.shifts} shift${totals.shifts === 1 ? "" : "s"}${filtered ? " found" : ""} · ${totals.orders} orders · ${fmtMoney(totals.sales)} sales · ${fmtMoney(totals.cash)} cash · ${fmtMoney(totals.other)} other accounts · ${fmtMoney(totals.expenses)} expenses`
              : "Every clock-in and clock-out with what was sold in that shift"
          }
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className={searchInputCls} />
        </PanelHead>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {error && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Clock in</Th>
                <Th>Clock out</Th>
                <Th>Duration</Th>
                <Th>Orders</Th>
                <Th>Sale amount</Th>
                <Th>Cash</Th>
                <Th>Other accounts</Th>
                <Th>Expenses</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const done = r.status === "closed";
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <Td className="font-medium">{r.employee_name || "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-mid">{fmtDateTime(r.clock_in_at)}</Td>
                    <Td className="whitespace-nowrap text-ink-mid">{r.clock_out_at ? fmtDateTime(r.clock_out_at) : "—"}</Td>
                    <Td className="whitespace-nowrap font-mono">
                      {done ? fmtDuration(r.duration_minutes) : r.status === "open" ? `${fmtDuration(minutesSince(r.clock_in_at))} so far` : "—"}
                    </Td>
                    <Td className="font-mono">{done ? r.orders_count ?? 0 : "—"}</Td>
                    <Td className="whitespace-nowrap font-mono font-medium">{done ? fmtMoney(r.sales_amount) : "—"}</Td>
                    <Td className="whitespace-nowrap font-mono">{done ? fmtMoney(r.cash_amount) : "—"}</Td>
                    <Td className="whitespace-nowrap font-mono" >
                      {done ? (
                        <>
                          {fmtMoney(r.other_amount)}
                          {!!r.other_breakdown?.length && (
                            <div className="mt-0.5 font-sans text-[11px] text-ink-faint">{r.other_breakdown.map((o) => `${o.method} ${fmtMoney(o.amount)}`).join(" · ")}</div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-mono">{done ? fmtMoney(r.expenses_amount) : "—"}</Td>
                    <Td>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </Td>
                  </tr>
                );
              })}
              {!loading && !error && rows.length === 0 && (
                <EmptyRow colSpan={10} label={filtered ? "No shifts match this search or date range." : "No shifts recorded yet - they appear here as staff clock in and out."} />
              )}
            </tbody>
          </table>
        </TableScroll>
        <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} />
      </Panel>
    </main>
  );
}
