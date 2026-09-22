"use client";
import { useEffect, useState } from "react";
import { Field, inputCls, btnPrimary } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge } from "@/components/ui/panel";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type Supplier = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type LedgerEntry = { id: string; amount: number; method: string; note: string | null; txn_date: string; suppliers?: { name: string } | null };

export function SupplierLedgerClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoadError("");
    const [sRes, mRes, eRes] = await Promise.all([
      fetchJson<{ suppliers: Supplier[] }>("/api/suppliers"),
      fetchJson<{ methods: PaymentMethod[]; paymentMethods?: PaymentMethod[] }>("/api/payment-methods"),
      fetchJson<{ entries: LedgerEntry[] }>("/api/supplier-ledger"),
    ]);
    const failed = [sRes, mRes, eRes].find((r) => !r.ok);
    setLoadError(failed ? failed.error : "");
    const suppliersList = sRes.ok ? sRes.data?.suppliers ?? [] : [];
    setSuppliers(suppliersList);
    setMethods(mRes.ok ? mRes.data?.paymentMethods ?? mRes.data?.methods ?? [] : []);
    setEntries(eRes.ok ? eRes.data?.entries ?? [] : []);
    if (!supplierId && suppliersList[0]) setSupplierId(suppliersList[0].id);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!supplierId || !amount || Number(amount) <= 0) {
      setError("Select a supplier and enter an amount");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/supplier-ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplierId, amount: Number(amount), method, note: note.trim() || undefined }),
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

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      {loadError && (
        <p className="mb-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
          Couldn&apos;t load supplier ledger data: {loadError}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold mb-4">Log a payment</h3>
          {error && <p className="mb-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
          <div className="space-y-3">
            <Field label="Supplier">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Method">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                {methods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Note (optional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. Partial payment for June" />
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
                  <Th>Supplier</Th>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <Td className="text-ink-mid">{l.txn_date}</Td>
                    <Td className="font-medium text-ink-strong">{l.suppliers?.name ?? "—"}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(l.amount)}</Td>
                    <Td>
                      <Badge>{l.method}</Badge>
                    </Td>
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
