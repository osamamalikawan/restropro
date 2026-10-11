"use client";
import { useEffect, useRef, useState } from "react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge } from "@/components/ui/panel";
import { DateRange } from "@/components/ui/date-range";
import { LoadMore } from "@/components/ui/load-more";
import { fmtDateTime, fmtMinutes } from "@/lib/format";

const PAGE = 50;

type Emp = { id: string; name: string; role: string; status: string; open: { id: string; clock_in_at: string; source: string } | null };
type Rec = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed";
  minutes: number | null;
  source: "manual" | "app";
  auto_closed: boolean;
  note: string | null;
  marked_by_name: string | null;
};
type Totals = { records: number; minutes: number; days: number };

/** `datetime-local` value for "now" (local time, minutes precision). */
const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Attendance: mark anyone on the roster in or out (they do not need to be an app user), see who is in right
 *  now, and browse every record with the hours worked. People are clocked out automatically when the shift ends
 *  (Permissions -> Default shift timings). Staff who sign in to the app are clocked in here automatically too. */
export function AttendanceClient({ canMark }: { canMark: boolean }) {
  const [tab, setTab] = useState<"today" | "records">("today");
  const [roster, setRoster] = useState<Emp[]>([]);
  const [shift, setShift] = useState<{ start: string; end: string } | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [error, setError] = useState("");
  const [, setTick] = useState(0); // re-render each minute so "worked so far" moves

  // clock in / out popup
  const [mark, setMark] = useState<{ emp: Emp; op: "clockIn" | "clockOut" } | null>(null);
  const [markAt, setMarkAt] = useState(localNow());
  const [markNote, setMarkNote] = useState("");
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState("");

  // records tab
  const [rows, setRows] = useState<Rec[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [empFilter, setEmpFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const latest = useRef(0);

  async function loadRoster() {
    try {
      const res = await fetch("/api/attendance/roster");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Could not load attendance");
      else {
        setError("");
        setRoster(d.employees ?? []);
        setShift(d.shift ?? null);
      }
    } catch {
      setError("Could not reach the server.");
    }
    setLoadingRoster(false);
  }
  useEffect(() => {
    loadRoster();
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function loadRecords(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (empFilter) params.set("employeeId", empFilter);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    try {
      const res = await fetch(`/api/attendance?${params}`);
      const d = await res.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!res.ok) return setError(d.error ?? "Could not load records");
      setError("");
      setHasMore(!!d.hasMore);
      if (d.totals) setTotals(d.totals);
      setRows((prev) => (offset === 0 ? d.records ?? [] : [...prev, ...(d.records ?? [])]));
    } catch {
      if (id === latest.current) setError("Could not reach the server.");
    }
  }
  useEffect(() => {
    if (tab !== "records") return;
    latest.current += 1;
    setLoadingRows(true);
    setRows([]);
    loadRecords(0).finally(() => setLoadingRows(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, empFilter, from, to]);

  function openMark(emp: Emp, op: "clockIn" | "clockOut") {
    setMark({ emp, op });
    setMarkAt(localNow());
    setMarkNote("");
    setMarkError("");
  }
  async function confirmMark() {
    if (!mark) return;
    setMarking(true);
    setMarkError("");
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: mark.op, employeeId: mark.emp.id, at: new Date(markAt).toISOString(), note: markNote.trim() || undefined }),
    });
    setMarking(false);
    if (!res.ok) return setMarkError((await res.json().catch(() => ({}))).error ?? "Could not save");
    setMark(null);
    await loadRoster();
    if (tab === "records") {
      latest.current += 1;
      loadRecords(0);
    }
  }

  const inCount = roster.filter((e) => e.open).length;
  const sinceMin = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["today", "records"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === t ? "bg-chili-500 text-white" : "border border-line bg-surface text-ink-mid hover:text-ink-strong"}`}
          >
            {t === "today" ? "Mark attendance" : "Records & hours"}
          </button>
        ))}
        {shift && (
          <span className="ml-auto text-xs text-ink-faint">
            Shift {shift.start} – {shift.end} · anyone still clocked in is clocked out automatically when the shift ends
          </span>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}

      {tab === "today" && (
        <Panel loading={loadingRoster} loadingLabel="Loading employees…">
          <PanelHead title="Mark attendance" subtitle={`${inCount} of ${roster.length} clocked in right now`} />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Employee</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Clocked in at</Th>
                  <Th>Worked so far</Th>
                  <Th>{canMark ? "Action" : ""}</Th>
                </tr>
              </thead>
              <tbody>
                {roster.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <Td className="font-medium">{e.name}</Td>
                    <Td className="capitalize text-ink-mid">{e.role}</Td>
                    <Td>{e.open ? <Badge tone="basil">Clocked in</Badge> : <Badge tone="steel">Out</Badge>}</Td>
                    <Td className="whitespace-nowrap text-ink-mid">{e.open ? fmtDateTime(e.open.clock_in_at) : "—"}</Td>
                    <Td className="whitespace-nowrap font-mono">{e.open ? fmtMinutes(sinceMin(e.open.clock_in_at)) : "—"}</Td>
                    <Td>
                      {canMark &&
                        (e.open ? (
                          <button onClick={() => openMark(e, "clockOut")} className="rounded-lg border border-crimson-500/40 bg-crimson-500/10 px-3 py-1.5 text-xs font-bold text-crimson-400 hover:bg-crimson-500/20">
                            Clock out
                          </button>
                        ) : (
                          <button onClick={() => openMark(e, "clockIn")} className="rounded-lg border border-basil-500/40 bg-basil-500/10 px-3 py-1.5 text-xs font-bold text-basil-400 hover:bg-basil-500/20">
                            Clock in
                          </button>
                        ))}
                    </Td>
                  </tr>
                ))}
                {!loadingRoster && roster.length === 0 && <EmptyRow colSpan={6} label="No employees yet - add them under Employees." />}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      )}

      {tab === "records" && (
        <Panel loading={loadingRows} loadingLabel="Loading records…">
          <PanelHead
            title="Records & hours"
            subtitle={totals ? `${totals.records} record${totals.records === 1 ? "" : "s"} · ${totals.days} day${totals.days === 1 ? "" : "s"} · ${fmtMinutes(totals.minutes)} worked` : "Every clock-in and clock-out with hours worked"}
          >
            <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="">All employees</option>
              {roster.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </PanelHead>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Employee</Th>
                  <Th>Clock in</Th>
                  <Th>Clock out</Th>
                  <Th>Hours</Th>
                  <Th>How</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <Td className="font-medium">{r.employee_name || "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-mid">{fmtDateTime(r.clock_in_at)}</Td>
                    <Td className="whitespace-nowrap text-ink-mid">{r.clock_out_at ? fmtDateTime(r.clock_out_at) : <Badge tone="basil">Still in</Badge>}</Td>
                    <Td className="whitespace-nowrap font-mono font-medium">{r.status === "closed" ? fmtMinutes(r.minutes) : `${fmtMinutes(sinceMin(r.clock_in_at))} so far`}</Td>
                    <Td className="whitespace-nowrap text-xs text-ink-mid">
                      {r.source === "app" ? "App sign-in" : `Marked${r.marked_by_name ? ` by ${r.marked_by_name}` : ""}`}
                      {r.auto_closed && <span className="ml-1.5"><Badge tone="turmeric">Auto clock-out</Badge></span>}
                    </Td>
                    <Td className="text-xs text-ink-mid">{r.note || ""}</Td>
                  </tr>
                ))}
                {!loadingRows && rows.length === 0 && <EmptyRow colSpan={6} label="No attendance records for this filter." />}
              </tbody>
            </table>
          </TableScroll>
          <LoadMore hasMore={hasMore} loading={loadingMore} onMore={async () => { setLoadingMore(true); await loadRecords(rows.length); setLoadingMore(false); }} />
        </Panel>
      )}

      <Modal
        open={!!mark}
        onClose={() => setMark(null)}
        busy={marking}
        title={mark?.op === "clockIn" ? `Clock in - ${mark.emp.name}` : `Clock out - ${mark?.emp.name ?? ""}`}
        width="max-w-sm"
        footer={
          <>
            <button onClick={() => setMark(null)} disabled={marking} className={btnGhost}>
              Cancel
            </button>
            <button onClick={confirmMark} disabled={marking} className={btnPrimary}>
              {marking ? "Saving…" : mark?.op === "clockIn" ? "Confirm clock in" : "Confirm clock out"}
            </button>
          </>
        }
      >
        {markError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{markError}</p>}
        {mark?.op === "clockOut" && mark.emp.open && (
          <p className="text-xs text-ink-mid">
            In since {fmtDateTime(mark.emp.open.clock_in_at)}. Hours are counted up to the time below.
          </p>
        )}
        <Field label="Time">
          <input type="datetime-local" value={markAt} max={localNow()} onChange={(e) => setMarkAt(e.target.value)} className={inputCls} />
          <p className="mt-1 text-[11px] text-ink-faint">Now by default - change it to record a clock {mark?.op === "clockIn" ? "in" : "out"} you forgot to mark.</p>
        </Field>
        {mark?.op === "clockIn" && (
          <Field label="Note (optional)">
            <input value={markNote} onChange={(e) => setMarkNote(e.target.value)} className={inputCls} placeholder="e.g. covering the evening shift" />
          </Field>
        )}
      </Modal>
    </main>
  );
}
