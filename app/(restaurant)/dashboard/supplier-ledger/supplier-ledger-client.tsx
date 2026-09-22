"use client";
import { useEffect, useState } from "react";
import { Field, inputCls, btnPrimary } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn } from "@/components/ui/panel";
import { LoadingOverlay, Spinner } from "@/components/ui/loading";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { Trash2 } from "lucide-react";

type Supplier = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type LedgerEntry = { id: string; amount: number; method: string; note: string | null; txn_date: string; suppliers?: { name: string } | null };
type PromisedPayment = {
  id: string;
  supplier_id: string;
  amount: number;
  promised_date: string;
  note: string | null;
  status: "pending" | "paid" | "cancelled";
  suppliers?: { name: string } | null;
};

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

  const [promises, setPromises] = useState<PromisedPayment[]>([]);
  const [promisesLoading, setPromisesLoading] = useState(true);
  const [pSupplierId, setPSupplierId] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(todayISO());
  const [pNote, setPNote] = useState("");
  const [pError, setPError] = useState("");
  const [pSaving, setPSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dueError, setDueError] = useState("");
  const [dueMethods, setDueMethods] = useState<Record<string, string>>({});

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
    if (!pSupplierId && suppliersList[0]) setPSupplierId(suppliersList[0].id);
    setLoading(false);
  }
  async function loadPromises() {
    setPromisesLoading(true);
    const res = await fetchJson<{ promises: PromisedPayment[] }>("/api/supplier-promised-payments");
    if (res.ok) setPromises(res.data?.promises ?? []);
    setPromisesLoading(false);
  }
  useEffect(() => {
    load();
    loadPromises();
  }, []);

  const entriesPage = usePagination(entries, 20);
  const pendingPromises = promises.filter((p) => p.status === "pending");
  const promisesPage = usePagination(pendingPromises, 10);
  const dueNow = pendingPromises.filter((p) => p.promised_date <= todayISO());

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

  async function submitPromise() {
    if (!pSupplierId || !pAmount || Number(pAmount) <= 0) {
      setPError("Select a supplier and enter an amount");
      return;
    }
    if (!pDate) {
      setPError("Set the promised date");
      return;
    }
    setPSaving(true);
    setPError("");
    const res = await fetch("/api/supplier-promised-payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { supplierId: pSupplierId, amount: Number(pAmount), promisedDate: pDate, note: pNote.trim() || undefined } }),
    });
    const data = await res.json().catch(() => ({}));
    setPSaving(false);
    if (!res.ok) {
      setPError(data.error ?? "Could not save");
      return;
    }
    setPAmount("");
    setPNote("");
    await loadPromises();
  }

  async function confirmPromise(p: PromisedPayment, pay: boolean) {
    if (pay && !dueMethods[p.id]) {
      setDueError("Select a payment method first");
      return;
    }
    setDueError("");
    setBusyId(p.id);
    const res = await fetch("/api/supplier-promised-payments/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, pay, method: dueMethods[p.id] }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setDueError(data.error || "Could not update this promise");
      return;
    }
    await Promise.all([loadPromises(), pay ? load() : Promise.resolve()]);
  }

  async function cancelPromise(p: PromisedPayment) {
    if (!confirm(`Cancel the promised payment of ${fmtMoney(p.amount)} to ${p.suppliers?.name ?? "this supplier"}?`)) return;
    setBusyId(p.id);
    const res = await fetch("/api/supplier-promised-payments/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, pay: false }),
    });
    setBusyId(null);
    if (res.ok) await loadPromises();
  }

  async function deletePromise(p: PromisedPayment) {
    if (!confirm("Remove this promised payment entirely?")) return;
    setBusyId(p.id);
    const res = await fetch("/api/supplier-promised-payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id: p.id } }),
    });
    setBusyId(null);
    if (res.ok) await loadPromises();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 space-y-6">
      {loadError && (
        <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
          Couldn&apos;t load supplier ledger data: {loadError}
        </p>
      )}

      {dueNow.length > 0 && (
        <div className="relative rounded-xl border border-turmeric-500/40 bg-turmeric-500/10 p-5">
          <h3 className="font-display font-semibold text-ink-strong text-sm mb-1">
            {dueNow.length} promised {dueNow.length === 1 ? "payment is" : "payments are"} due
          </h3>
          <p className="text-xs text-ink-faint mb-3">Confirm to log the payment, or cancel the promise if it's off.</p>
          {dueError && <p className="text-xs text-crimson-400 mb-3">{dueError}</p>}
          <div className="space-y-2">
            {dueNow.map((p) => (
              <div key={p.id} className="relative flex items-center justify-between gap-3 rounded-lg bg-surface border border-line px-3.5 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-strong truncate">{p.suppliers?.name ?? "—"}</div>
                  <div className="text-xs text-ink-faint">
                    Promised for {p.promised_date} · <span className="font-mono">{fmtMoney(p.amount)}</span>
                    {p.note && ` · ${p.note}`}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                  <select
                    value={dueMethods[p.id] ?? ""}
                    onChange={(e) => setDueMethods((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="rounded-md bg-raised border border-line px-2 py-1.5 text-xs"
                  >
                    <option value="">Payment method…</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => confirmPromise(p, false)}
                    disabled={busyId === p.id}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-mid hover:text-ink-strong disabled:opacity-50"
                  >
                    Cancel promise
                  </button>
                  <button
                    onClick={() => confirmPromise(p, true)}
                    disabled={busyId === p.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
                  >
                    {busyId === p.id && <Spinner size={12} />}
                    Log payment
                  </button>
                </div>
                <LoadingOverlay show={busyId === p.id} />
              </div>
            ))}
          </div>
        </div>
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
                {entriesPage.pageItems.map((l) => (
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
          <Pagination page={entriesPage.page} pageCount={entriesPage.pageCount} onChange={entriesPage.setPage} total={entriesPage.total} pageSize={entriesPage.pageSize} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold mb-4">Promise a payment</h3>
          <p className="text-xs text-ink-faint mb-3">Commit to paying a supplier on a future date — you'll be asked to confirm when it's due.</p>
          {pError && <p className="mb-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{pError}</p>}
          <div className="space-y-3">
            <Field label="Supplier">
              <select value={pSupplierId} onChange={(e) => setPSupplierId(e.target.value)} className={inputCls}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input value={pAmount} onChange={(e) => setPAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Promised date">
              <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Note (optional)">
              <input value={pNote} onChange={(e) => setPNote(e.target.value)} className={inputCls} placeholder="e.g. Half of June invoice" />
            </Field>
            <button onClick={submitPromise} disabled={pSaving} className={`${btnPrimary} w-full justify-center`}>
              {pSaving ? "Saving…" : "Add promise"}
            </button>
          </div>
        </div>

        <Panel loading={promisesLoading}>
          <PanelHead title="Promised payments" subtitle="Pending commitments — resolved ones drop off this list once paid or cancelled" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Promised date</Th>
                  <Th>Supplier</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {promisesPage.pageItems.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <Td className={p.promised_date <= todayISO() ? "text-turmeric-400 font-medium" : "text-ink-mid"}>{p.promised_date}</Td>
                    <Td className="font-medium text-ink-strong">{p.suppliers?.name ?? "—"}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(p.amount)}</Td>
                    <Td className="text-ink-mid">{p.note || "—"}</Td>
                    <Td>
                      <IconBtn title="Cancel & remove" onClick={() => deletePromise(p)} disabled={busyId === p.id}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </Td>
                  </tr>
                ))}
                {pendingPromises.length === 0 && <EmptyRow colSpan={5} label="No pending promises." />}
              </tbody>
            </table>
          </TableScroll>
          <Pagination page={promisesPage.page} pageCount={promisesPage.pageCount} onChange={promisesPage.setPage} total={promisesPage.total} pageSize={promisesPage.pageSize} />
        </Panel>
      </div>
    </main>
  );
}
