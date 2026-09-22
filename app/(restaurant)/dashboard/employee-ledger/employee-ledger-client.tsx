"use client";
import { useEffect, useState } from "react";
import { Field, inputCls, btnPrimary } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge } from "@/components/ui/panel";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type Employee = { id: string; name: string };
type LedgerEntry = { id: string; type: string; amount: number; note: string | null; txn_date: string; employees?: { name: string } | null };

const TYPES = ["salary", "advance", "bonus", "deduction"] as const;

export function EmployeeLedgerClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("salary");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoadError("");
    const [eRes, lRes] = await Promise.all([
      fetchJson<{ employees: Employee[] }>("/api/employees"),
      fetchJson<{ entries: LedgerEntry[] }>("/api/employee-ledger"),
    ]);
    const failed = [eRes, lRes].find((r) => !r.ok);
    setLoadError(failed ? failed.error : "");
    const employeesList = eRes.ok ? eRes.data?.employees ?? [] : [];
    setEmployees(employeesList);
    setEntries(lRes.ok ? lRes.data?.entries ?? [] : []);
    if (!employeeId && employeesList[0]) setEmployeeId(employeesList[0].id);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!employeeId || !amount || Number(amount) <= 0) {
      setError("Select an employee and enter an amount");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/employee-ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId, type, amount: Number(amount), note: note.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not log payment");
      return;
    }
    setAmount("");
    setNote("");
    await load();
  }

  const ledgerPage = usePagination(entries, 20);

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      {loadError && (
        <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
          Couldn&apos;t load employee ledger data: {loadError}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold mb-4">Log a payment</h3>
          {error && <p className="mb-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
          <div className="space-y-3">
            <Field label="Employee">
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className={inputCls}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Note (optional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. June salary" />
            </Field>
            <button onClick={submit} disabled={saving} className={`${btnPrimary} w-full justify-center`}>
              {saving ? "Saving…" : "Log payment"}
            </button>
          </div>
        </div>

        <Panel loading={loading}>
          <PanelHead title="Payment history" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Date</Th>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {ledgerPage.pageItems.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <Td className="text-ink-mid">{l.txn_date}</Td>
                    <Td className="font-medium text-ink-strong">{l.employees?.name ?? "—"}</Td>
                    <Td>
                      <Badge>{l.type}</Badge>
                    </Td>
                    <Td className="font-mono font-medium">{fmtMoney(l.amount)}</Td>
                    <Td className="text-ink-mid">{l.note || "—"}</Td>
                  </tr>
                ))}
                {entries.length === 0 && <EmptyRow colSpan={5} label="No payments logged yet." />}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      </div>
    </main>
  );
}
