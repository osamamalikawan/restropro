"use client";
import { useEffect, useState } from "react";
import { LoadingOverlay, PageLoader, Spinner } from "@/components/ui/loading";

type Sale = {
  id: string;
  order_no: number;
  order_type: string;
  total: number;
  created_at: string;
  customers: { name: string; phone: string } | null;
  sale_payments: { method: string; amount: number }[];
};

/** Matches the prototype's Unpaid Orders view: sales still short of their total, with a
 *  balance-due figure per row and a Collect Payment action (see
 *  /api/sales/collect-payment, collect_sale_payment() in migration 0010). */
export function UnpaidOrdersClient() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [methods, setMethods] = useState<string[]>(["Cash"]);
  const [collecting, setCollecting] = useState<Sale | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/sales?limit=200");
    const data = await res.json();
    if (res.ok) setSales((data.sales ?? []).filter((s: { status: string }) => s.status === "unpaid"));
  }
  useEffect(() => {
    load();
    fetch("/api/payment-methods")
      .then((r) => r.json())
      .then((d) => {
        const names = (d.methods ?? []).map((m: { name: string }) => m.name);
        if (names.length) setMethods(names);
      });
  }, []);

  function balanceOf(s: Sale) {
    const paid = s.sale_payments.reduce((sum, p) => sum + p.amount, 0);
    return Math.max(s.total - paid, 0);
  }

  function openCollect(s: Sale) {
    setCollecting(s);
    setAmount(String(balanceOf(s)));
    setMethod("Cash");
    setError("");
  }

  async function submitCollect() {
    if (!collecting) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/sales/collect-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: collecting.id, method, amount: amt }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCollecting(null);
    load();
  }

  return (
    <main className="p-6 md:p-8">
      {sales === null ? (
        <PageLoader label="Loading unpaid orders…" />
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
              <tr>
                <th className="text-left p-3">Order</th>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Paid</th>
                <th className="text-right p-3">Balance due</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const paid = s.sale_payments.reduce((sum, p) => sum + p.amount, 0);
                const balance = balanceOf(s);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="p-3 font-mono">#{s.order_no}</td>
                    <td className="p-3 text-ink-mid">
                      {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="p-3 text-ink-mid">{s.customers?.name ?? "Walk-in"}</td>
                    <td className="p-3 text-right font-mono">Rs {s.total.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-ink-mid">Rs {paid.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-semibold text-crimson-400">Rs {balance.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openCollect(s)}
                        className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5"
                      >
                        Collect payment
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-ink-faint">
                    No unpaid orders — everything's settled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {collecting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setCollecting(null);
          }}
        >
          <div className="relative w-full max-w-sm rounded-xl border border-line bg-surface p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">Collect payment — #{collecting.order_no}</h3>
            <div className="flex justify-between text-sm text-ink-mid">
              <span>Balance due</span>
              <span className="font-mono font-semibold text-ink-strong">Rs {balanceOf(collecting).toLocaleString()}</span>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-ink-mid">Amount received</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg bg-raised border border-line px-3 py-2 text-sm mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-mid">Payment method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg bg-raised border border-line px-3 py-2 text-sm mt-1">
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {error && <p className="text-crimson-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setCollecting(null)}
                disabled={saving}
                className="flex-1 rounded-lg bg-raised hover:bg-hover py-2.5 font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitCollect}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5 text-sm"
              >
                {saving && <Spinner size={14} />}
                Confirm
              </button>
            </div>
            <LoadingOverlay show={saving} />
          </div>
        </div>
      )}
    </main>
  );
}
