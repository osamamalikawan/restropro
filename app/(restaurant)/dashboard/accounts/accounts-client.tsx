"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Equal, Hourglass } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, KpiCard, addBtnCls } from "@/components/ui/panel";
import { fmtMoney, todayISO } from "@/lib/format";

type AccountEntry = { id: string; txn_date: string; description: string; category: string; type: "income" | "expense"; amount: number };
type Supplier = { id: string };
type Purchase = { supplier_id: string | null; total_cost: number };
type LedgerEntry = { supplier_id: string; amount: number };

export function AccountsClient() {
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [fType, setFType] = useState<"income" | "expense">("income");
  const [fCategory, setFCategory] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [aRes, sRes, pRes, lRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/suppliers"),
      fetch("/api/restock?limit=1000"),
      fetch("/api/supplier-ledger?limit=1000"),
    ]);
    const [a, s, p, l] = await Promise.all([aRes.json(), sRes.json(), pRes.json(), lRes.json()]);
    setEntries(a.accounts ?? []);
    setSuppliers(s.suppliers ?? []);
    setPurchases(p.purchases ?? []);
    setLedger(l.entries ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const supplierPayable = suppliers.reduce((sum, s) => {
    const purchased = purchases.filter((p) => p.supplier_id === s.id).reduce((x, p) => x + Number(p.total_cost), 0);
    const paid = ledger.filter((l) => l.supplier_id === s.id).reduce((x, l) => x + Number(l.amount), 0);
    return sum + Math.max(0, purchased - paid);
  }, 0);

  // Running balance — oldest-first cumulative, then displayed newest-first (matches prototype).
  const withBalance = useMemo(() => {
    const sorted = [...entries].sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1));
    let running = 0;
    const balances = new Map<string, number>();
    for (const e of sorted) {
      running += e.type === "income" ? Number(e.amount) : -Number(e.amount);
      balances.set(e.id, running);
    }
    return entries.map((e) => ({ ...e, balance: balances.get(e.id) ?? 0 }));
  }, [entries]);

  function openAdd() {
    setFType("income");
    setFCategory("");
    setFDesc("");
    setFAmount("");
    setFDate(todayISO());
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fAmount || !fCategory.trim()) {
      setError("Amount and category are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: fDesc.trim() || fCategory.trim(), category: fCategory.trim(), type: fType, amount: Number(fAmount) }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save entry");
      return;
    }
    setModalOpen(false);
    await load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total income" value={<span className="flex items-center gap-1.5 text-basil-400"><ArrowUp className="h-4 w-4" />{fmtMoney(income)}</span>} />
        <KpiCard label="Total expense" value={<span className="flex items-center gap-1.5 text-crimson-400"><ArrowDown className="h-4 w-4" />{fmtMoney(expense)}</span>} />
        <KpiCard label="Net income" value={<span className="flex items-center gap-1.5"><Equal className="h-4 w-4" />{fmtMoney(income - expense)}</span>} />
        <KpiCard label="Supplier payable" value={<span className="flex items-center gap-1.5 text-turmeric-500"><Hourglass className="h-4 w-4" />{fmtMoney(supplierPayable)}</span>} />
      </div>

      <Panel>
        <PanelHead title="Ledger" subtitle="Income & expense transactions">
          <button onClick={openAdd} className={addBtnCls}>
            + Add entry
          </button>
        </PanelHead>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {withBalance.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td className="text-ink-mid">{e.txn_date}</Td>
                  <Td className="font-medium text-ink-strong">{e.description}</Td>
                  <Td>
                    <Badge>{e.category}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={e.type === "income" ? "basil" : "crimson"}>{e.type === "income" ? "Income" : "Expense"}</Badge>
                  </Td>
                  <Td className={`font-mono font-medium ${e.type === "income" ? "text-basil-400" : "text-crimson-400"}`}>
                    {e.type === "income" ? "+" : "-"}
                    {fmtMoney(e.amount)}
                  </Td>
                  <Td className="font-mono text-ink-mid">{fmtMoney(e.balance)}</Td>
                </tr>
              ))}
              {!loading && withBalance.length === 0 && <EmptyRow colSpan={6} label="No ledger entries yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add ledger entry"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Type">
          <select value={fType} onChange={(e) => setFType(e.target.value as "income" | "expense")} className={inputCls}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </Field>
        <Field label="Category">
          <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls} placeholder="e.g. Other income" />
        </Field>
        <Field label="Description (optional)">
          <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Date">
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
        </Field>
      </Modal>
    </main>
  );
}
