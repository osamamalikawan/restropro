"use client";
import { useEffect, useState } from "react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, addBtnCls } from "@/components/ui/panel";
import { LoadingOverlay, Spinner } from "@/components/ui/loading";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { Pencil, Trash2 } from "lucide-react";

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
type Frequency = "daily" | "weekly" | "fortnightly" | "monthly" | "yearly";
type RecurringExpense = {
  id: string;
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  payment_method: string;
  frequency: Frequency;
  next_due_date: string;
  is_active: boolean;
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
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

  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dueError, setDueError] = useState("");

  const [recurModalOpen, setRecurModalOpen] = useState(false);
  const [rEditingId, setREditingId] = useState<string | null>(null);
  const [rCategory, setRCategory] = useState("");
  const [rAmount, setRAmount] = useState("");
  const [rVendor, setRVendor] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rMethod, setRMethod] = useState("Cash");
  const [rFrequency, setRFrequency] = useState<Frequency>("monthly");
  const [rNextDate, setRNextDate] = useState(todayISO());
  const [rError, setRError] = useState("");
  const [rSaving, setRSaving] = useState(false);

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

  async function loadRecurring() {
    setRecurringLoading(true);
    const res = await fetchJson<{ recurringExpenses: RecurringExpense[] }>("/api/recurring-expenses");
    if (res.ok) setRecurring(res.data?.recurringExpenses ?? []);
    setRecurringLoading(false);
  }
  useEffect(() => {
    load();
    loadRecurring();
  }, []);

  const dueNow = recurring.filter((r) => r.is_active && r.next_due_date <= todayISO());

  async function confirmDue(r: RecurringExpense, logIt: boolean) {
    setDueError("");
    setBusyId(r.id);
    const res = await fetch("/api/recurring-expenses/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: r.id, log: logIt }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setDueError(data.error || "Could not update this recurring expense");
      return;
    }
    await Promise.all([loadRecurring(), logIt ? load() : Promise.resolve()]);
  }

  function openAddRecurring() {
    setREditingId(null);
    setRCategory(categories[0]?.name ?? "");
    setRAmount("");
    setRVendor("");
    setRDesc("");
    setRMethod(methods[0]?.name ?? "Cash");
    setRFrequency("monthly");
    setRNextDate(todayISO());
    setRError("");
    setRecurModalOpen(true);
  }
  function openEditRecurring(r: RecurringExpense) {
    setREditingId(r.id);
    setRCategory(r.category);
    setRAmount(String(r.amount));
    setRVendor(r.vendor ?? "");
    setRDesc(r.description ?? "");
    setRMethod(r.payment_method);
    setRFrequency(r.frequency);
    setRNextDate(r.next_due_date);
    setRError("");
    setRecurModalOpen(true);
  }

  async function saveRecurring() {
    if (!rAmount || Number(rAmount) <= 0) {
      setRError("Enter an amount");
      return;
    }
    if (!rNextDate) {
      setRError("Set the next payment date");
      return;
    }
    setRSaving(true);
    setRError("");
    const body = rEditingId
      ? {
          op: "update",
          row: {
            id: rEditingId,
            category: rCategory || categories[0]?.name || "Other",
            amount: Number(rAmount),
            vendor: rVendor.trim() || null,
            description: rDesc.trim() || null,
            payment_method: rMethod,
            frequency: rFrequency,
            next_due_date: rNextDate,
          },
        }
      : {
          op: "insert",
          row: {
            category: rCategory || categories[0]?.name || "Other",
            amount: Number(rAmount),
            vendor: rVendor.trim() || undefined,
            description: rDesc.trim() || undefined,
            paymentMethod: rMethod,
            frequency: rFrequency,
            nextDueDate: rNextDate,
          },
        };
    const res = await fetch("/api/recurring-expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setRSaving(false);
    if (!res.ok) {
      setRError(data.error || "Could not save");
      return;
    }
    setRecurModalOpen(false);
    await loadRecurring();
  }

  async function deleteRecurring(r: RecurringExpense) {
    if (!confirm(`Remove the recurring "${r.category}" (${FREQUENCY_LABEL[r.frequency]}) expense? This won't affect past logged entries.`)) return;
    setBusyId(r.id);
    const res = await fetch("/api/recurring-expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id: r.id } }),
    });
    setBusyId(null);
    if (res.ok) await loadRecurring();
  }

  async function toggleActive(r: RecurringExpense) {
    setBusyId(r.id);
    const res = await fetch("/api/recurring-expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row: { id: r.id, is_active: !r.is_active } }),
    });
    setBusyId(null);
    if (res.ok) await loadRecurring();
  }

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
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 space-y-6">
      {dueNow.length > 0 && (
        <div className="relative rounded-xl border border-turmeric-500/40 bg-turmeric-500/10 p-5">
          <h3 className="font-display font-semibold text-ink-strong text-sm mb-1">
            {dueNow.length} recurring {dueNow.length === 1 ? "expense is" : "expenses are"} due
          </h3>
          <p className="text-xs text-ink-faint mb-3">Confirm each one to log the payment, or skip it if it wasn't paid this time.</p>
          {dueError && <p className="text-xs text-crimson-400 mb-3">{dueError}</p>}
          <div className="space-y-2">
            {dueNow.map((r) => (
              <div key={r.id} className="relative flex items-center justify-between gap-3 rounded-lg bg-surface border border-line px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-strong truncate">
                    {r.category}
                    {r.vendor && <span className="text-ink-faint"> · {r.vendor}</span>}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {FREQUENCY_LABEL[r.frequency]} · was due {r.next_due_date} · <span className="font-mono">{fmtMoney(r.amount)}</span> via{" "}
                    {r.payment_method}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => confirmDue(r, false)}
                    disabled={busyId === r.id}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-mid hover:text-ink-strong disabled:opacity-50"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => confirmDue(r, true)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
                  >
                    {busyId === r.id && <Spinner size={12} />}
                    Log payment
                  </button>
                </div>
                <LoadingOverlay show={busyId === r.id} />
              </div>
            ))}
          </div>
        </div>
      )}

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

      <Panel loading={recurringLoading}>
        <PanelHead title="Recurring expenses" subtitle="Rent, subscriptions, and anything else that repeats on a schedule">
          <button onClick={openAddRecurring} className={addBtnCls}>
            + Add recurring expense
          </button>
        </PanelHead>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Category</Th>
                <Th>Vendor</Th>
                <Th>Amount</Th>
                <Th>Frequency</Th>
                <Th>Next due</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <Td>{r.category}</Td>
                  <Td className="text-ink-mid">{r.vendor || "—"}</Td>
                  <Td className="font-mono font-medium">{fmtMoney(r.amount)}</Td>
                  <Td className="text-ink-mid">{FREQUENCY_LABEL[r.frequency]}</Td>
                  <Td className={r.is_active && r.next_due_date <= todayISO() ? "text-turmeric-400 font-medium" : "text-ink-mid"}>
                    {r.next_due_date}
                  </Td>
                  <Td>
                    <button onClick={() => toggleActive(r)} disabled={busyId === r.id}>
                      <Badge tone={r.is_active ? "basil" : "steel"}>{r.is_active ? "Active" : "Paused"}</Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <IconBtn title="Edit" onClick={() => openEditRecurring(r)} disabled={busyId === r.id}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => deleteRecurring(r)} disabled={busyId === r.id}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              ))}
              {!recurringLoading && recurring.length === 0 && <EmptyRow colSpan={7} label="No recurring expenses set up yet." />}
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

      <Modal
        busy={rSaving}
        open={recurModalOpen}
        onClose={() => setRecurModalOpen(false)}
        title={rEditingId ? "Edit recurring expense" : "Add recurring expense"}
        footer={
          <>
            <button onClick={() => setRecurModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveRecurring} disabled={rSaving} className={btnPrimary}>
              {rSaving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {rError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{rError}</p>}
        <Field label="Category">
          <select value={rCategory} onChange={(e) => setRCategory(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <input value={rVendor} onChange={(e) => setRVendor(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description (optional)">
          <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input value={rAmount} onChange={(e) => setRAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
        </Field>
        <Field label="Payment method">
          <select value={rMethod} onChange={(e) => setRMethod(e.target.value)} className={inputCls}>
            {methods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeats">
          <select value={rFrequency} onChange={(e) => setRFrequency(e.target.value as Frequency)} className={inputCls}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next payment date">
          <input type="date" value={rNextDate} onChange={(e) => setRNextDate(e.target.value)} className={inputCls} />
        </Field>
      </Modal>
    </main>
  );
}
