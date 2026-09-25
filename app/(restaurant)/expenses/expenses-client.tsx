"use client";
import { useEffect, useState } from "react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, addBtnCls } from "@/components/ui/panel";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type ExpenseCategory = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type Expense = {
  id: string;
  category: string;
  expense_type: "regular" | "recurring";
  amount: number;
  vendor: string | null;
  description: string | null;
  payment_method: string;
  txn_date: string;
};

export function ExpensesClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [fDate, setFDate] = useState(todayISO());
  const [fType, setFType] = useState<"regular" | "recurring">("regular");
  const [fCategory, setFCategory] = useState("");
  const [fVendor, setFVendor] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fMethod, setFMethod] = useState("Cash");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    const [eRes, cRes, mRes] = await Promise.all([
      fetchJson<{ expenses: Expense[] }>("/api/expenses"),
      fetchJson<{ categories: ExpenseCategory[] }>("/api/expense-categories"),
      fetchJson<{ methods: PaymentMethod[] }>("/api/payment-methods"),
    ]);
    if (!eRes.ok) {
      setLoadError(eRes.error);
      setExpenses([]);
    } else {
      setExpenses(eRes.data?.expenses ?? []);
    }
    setCategories(cRes.ok ? cRes.data?.categories ?? [] : []);
    setMethods(mRes.ok ? mRes.data?.methods ?? [] : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setFDate(todayISO());
    setFType("regular");
    setFCategory(categories[0]?.name ?? "");
    setFVendor("");
    setFDesc("");
    setFAmount("");
    setFMethod(methods[0]?.name ?? "Cash");
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fAmount || Number(fAmount) <= 0) {
      setError("Enter an amount");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: fCategory || categories[0]?.name || "Other",
        expenseType: fType,
        amount: Number(fAmount),
        vendor: fVendor.trim() || undefined,
        description: fDesc.trim() || undefined,
        paymentMethod: fMethod,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not log expense");
      return;
    }
    setModalOpen(false);
    await load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead title="Expenses" subtitle="Regular and recurring restaurant expenses">
          <button onClick={openAdd} className={addBtnCls}>
            + Add expense
          </button>
        </PanelHead>
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load expenses: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Category</Th>
                <Th>Vendor</Th>
                <Th>Description</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td className="text-ink-mid">{e.txn_date}</Td>
                  <Td>
                    <Badge tone={e.expense_type === "recurring" ? "turmeric" : "steel"}>{e.expense_type === "recurring" ? "Recurring" : "Regular"}</Badge>
                  </Td>
                  <Td>{e.category}</Td>
                  <Td className="text-ink-mid">{e.vendor || "—"}</Td>
                  <Td className="text-ink-mid">{e.description || "—"}</Td>
                  <Td className="font-mono font-medium">{fmtMoney(e.amount)}</Td>
                  <Td className="text-ink-mid">{e.payment_method}</Td>
                </tr>
              ))}
              {!loading && !loadError && expenses.length === 0 && <EmptyRow colSpan={7} label="No expenses logged yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Modal
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add expense"
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
        <Field label="Date">
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Type">
          <select value={fType} onChange={(e) => setFType(e.target.value as "regular" | "recurring")} className={inputCls}>
            <option value="regular">Regular</option>
            <option value="recurring">Recurring</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <input value={fVendor} onChange={(e) => setFVendor(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description (optional)">
          <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
        </Field>
        <Field label="Payment method">
          <select value={fMethod} onChange={(e) => setFMethod(e.target.value)} className={inputCls}>
            {methods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </main>
  );
}
