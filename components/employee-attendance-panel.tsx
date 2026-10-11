"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, KpiCard } from "@/components/ui/panel";
import { fmtDateTime, fmtMinutes } from "@/lib/format";

type Rec = { id: string; clock_in_at: string; clock_out_at: string | null; status: "open" | "closed"; minutes: number | null; source: "manual" | "app"; auto_closed: boolean; marked_by_name: string | null };
type Totals = { records: number; minutes: number; days: number };

/** The attendance part of an employee's profile: this month's hours and days, and the latest records. */
export function EmployeeAttendancePanel({ employeeId }: { employeeId: string }) {
  const [recent, setRecent] = useState<Rec[]>([]);
  const [month, setMonth] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    Promise.all([
      fetch(`/api/attendance?employeeId=${employeeId}&limit=15`).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
      fetch(`/api/attendance?employeeId=${employeeId}&from=${encodeURIComponent(monthStart)}&limit=1`).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
    ])
      .then(([a, b]) => {
        if (!alive) return;
        if (!a.ok) return setError(a.d.error ?? "Could not load attendance");
        setRecent(a.d.records ?? []);
        if (b.ok) setMonth(b.d.totals ?? null);
      })
      .catch(() => alive && setError("Could not reach the server."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [employeeId]);

  const open = recent.find((r) => r.status === "open");
  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <KpiCard label="Hours this month" value={month ? fmtMinutes(month.minutes) : "—"} />
        <KpiCard label="Days present this month" value={month ? month.days : "—"} />
        <KpiCard label="Right now" value={open ? "Clocked in" : "Out"} />
      </div>
      <Panel loading={loading}>
        <PanelHead title="Attendance" subtitle="Latest 15 clock-ins and clock-outs">
          <Link href="/attendance" className="text-xs font-semibold text-chili-500 hover:underline">
            Open Attendance
          </Link>
        </PanelHead>
        {error && <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Clock in</Th>
                <Th>Clock out</Th>
                <Th>Hours</Th>
                <Th>How</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <Td className="whitespace-nowrap text-ink-mid">{fmtDateTime(r.clock_in_at)}</Td>
                  <Td className="whitespace-nowrap text-ink-mid">{r.clock_out_at ? fmtDateTime(r.clock_out_at) : <Badge tone="basil">Still in</Badge>}</Td>
                  <Td className="whitespace-nowrap font-mono font-medium">{r.status === "closed" ? fmtMinutes(r.minutes) : "—"}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-mid">
                    {r.source === "app" ? "App sign-in" : `Marked${r.marked_by_name ? ` by ${r.marked_by_name}` : ""}`}
                    {r.auto_closed && <span className="ml-1.5"><Badge tone="turmeric">Auto clock-out</Badge></span>}
                  </Td>
                </tr>
              ))}
              {!loading && !error && recent.length === 0 && <EmptyRow colSpan={4} label="No attendance recorded yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}
