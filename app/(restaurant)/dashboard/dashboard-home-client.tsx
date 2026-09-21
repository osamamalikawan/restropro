"use client";
import { useEffect, useState } from "react";
import { PageLoader } from "@/components/ui/loading";
import Link from "next/link";
import { DollarSign, TrendingUp, Receipt, Layers, AlertTriangle, Clock, Users, Pencil, X } from "lucide-react";
import { EditOrderModal } from "@/components/edit-order-modal";

type Summary = {
  salesTotal: number;
  salesCount: number;
  expensesToday: number;
  inventoryValue: number;
  inventoryCount: number;
  lowStockCount: number;
  unpaidCount: number;
  unpaidDue: number;
  activeEmployees: number;
  topProducts: { name: string; qty: number }[];
};

type Sale = {
  id: string;
  order_no: number;
  order_type: string;
  total: number;
  delivery_charge: number;
  status: string;
  created_at: string;
  customers: { name: string } | null;
  employees: { name: string } | null;
  sale_items: { product_id: string; name: string; unit_price: number; quantity: number }[];
  sale_payments: { method: string }[];
};

const TYPE_LABEL: Record<string, string> = { dine_in: "Dine In", takeaway: "Takeaway", delivery: "Delivery" };

/** Matches the prototype's renderDashboard() KPI cards + recent-sales table + top-products
 *  list. Gross Profit and Supplier Payable aren't included — see migration 0011's comment
 *  for why those two specifically were left for later. */
export function DashboardHomeClient({ employeeName, role }: { employeeName: string; role: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [taxRate, setTaxRate] = useState(0.05);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const canManage = role === "admin" || role === "manager";

  function reload() {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setSummary(d.summary));
    fetch("/api/sales?limit=8")
      .then((r) => r.json())
      .then((d) => setRecent(d.sales ?? []));
  }

  useEffect(() => {
    reload();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings?.tax_rate != null && setTaxRate(Number(d.settings.tax_rate) / 100));
  }, []);

  async function cancelOrder(sale: Sale) {
    if (!window.confirm(`Cancel order #${sale.order_no}? This restores stock and removes it from today's income.`)) return;
    const res = await fetch("/api/sales/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: sale.id }),
    });
    if (res.ok) reload();
  }

  if (!summary) {
    return (
      <main className="p-6 md:p-8">
        <PageLoader label="Loading dashboard…" />
      </main>
    );
  }

  const avgOrder = summary.salesCount ? summary.salesTotal / summary.salesCount : 0;
  const topMax = summary.topProducts[0]?.qty || 1;

  const kpis = [
    { label: "Today's sales", value: `Rs ${summary.salesTotal.toLocaleString()}`, delta: `${summary.salesCount} orders`, color: "#D9481F", Icon: DollarSign },
    { label: "Avg order value", value: `Rs ${Math.round(avgOrder).toLocaleString()}`, delta: "per order", color: "#C99A3E", Icon: TrendingUp },
    { label: "Expenses today", value: `Rs ${summary.expensesToday.toLocaleString()}`, delta: "logged today", color: "#B7383F", Icon: Receipt },
    { label: "Inventory value", value: `Rs ${summary.inventoryValue.toLocaleString()}`, delta: `${summary.inventoryCount} items`, color: "#3F6E52", Icon: Layers },
    {
      label: "Low stock alerts",
      value: String(summary.lowStockCount),
      delta: summary.lowStockCount ? "needs reorder" : "all stocked",
      color: "#B7383F",
      Icon: AlertTriangle,
    },
    {
      label: "Unpaid orders",
      value: String(summary.unpaidCount),
      delta: summary.unpaidCount ? `Rs ${summary.unpaidDue.toLocaleString()} due` : "all collected",
      color: "#B7383F",
      Icon: Clock,
    },
    { label: "On shift now", value: String(summary.activeEmployees), delta: "staff active", color: "#E86B3E", Icon: Users },
  ];

  return (
    <main className="p-6 md:p-8">
      <p className="text-ink-faint text-sm mb-5">
        Signed in as {employeeName} <span className="capitalize">({role})</span>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: `${k.color}22`, color: k.color }}
            >
              <k.Icon size={17} />
            </div>
            <div className="text-xs text-ink-faint mb-1">{k.label}</div>
            <div className="font-display text-xl font-semibold text-ink-strong">{k.value}</div>
            <div className="text-xs mt-0.5" style={{ color: k.color }}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-line bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <h3 className="font-display font-semibold text-sm text-ink-strong">Recent orders</h3>
            <Link href="/dashboard/sales" className="text-xs text-chili-400 hover:underline">
              View all →
            </Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="p-3 font-mono text-xs">#{s.order_no}</td>
                  <td className="p-3 text-xs text-ink-mid">{TYPE_LABEL[s.order_type] ?? s.order_type}</td>
                  <td className="p-3 text-xs text-ink-mid">{s.employees?.name ?? "—"}</td>
                  <td className="p-3 text-xs text-ink-mid">{s.sale_items.length} item(s)</td>
                  <td className="p-3 text-xs text-ink-mid">{s.sale_payments.map((p) => p.method).join(", ") || "—"}</td>
                  <td className={`p-3 text-right font-mono text-xs ${s.status === "cancelled" ? "line-through text-ink-faint" : "font-semibold"}`}>
                    Rs {s.total.toLocaleString()}
                  </td>
                  <td className="p-3 text-right text-xs text-ink-faint">
                    {new Date(s.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="p-3 text-right">
                    {s.status === "cancelled" ? (
                      <span className="text-[10px] uppercase font-bold text-crimson-400">Cancelled</span>
                    ) : canManage ? (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditingSale(s)}
                          className="w-7 h-7 rounded-lg bg-raised border border-line text-ink-mid flex items-center justify-center"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => cancelOrder(s)}
                          className="w-7 h-7 rounded-lg bg-raised border border-line text-ink-mid flex items-center justify-center"
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-ink-faint text-sm">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display font-semibold text-sm text-ink-strong mb-3">Top products</h3>
          {summary.topProducts.length === 0 ? (
            <p className="text-xs text-ink-faint">No sales yet — ring up an order in POS to see your top sellers.</p>
          ) : (
            <div className="space-y-2.5">
              {summary.topProducts.map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ink-mid">{p.name}</span>
                    <span className="font-mono font-semibold text-ink-strong">{p.qty}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                    <div className="h-full bg-chili-500 rounded-full" style={{ width: `${Math.round((p.qty / topMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingSale && (
        <EditOrderModal
          saleId={editingSale.id}
          orderNo={editingSale.order_no}
          taxRate={taxRate}
          deliveryCharge={editingSale.delivery_charge || 0}
          initialItems={editingSale.sale_items}
          onClose={() => setEditingSale(null)}
          onSaved={() => {
            setEditingSale(null);
            reload();
          }}
        />
      )}
    </main>
  );
}
