"use client";
import { useEffect, useState } from "react";
import { EditOrderModal } from "@/components/edit-order-modal";

type Sale = {
  id: string;
  order_no: number;
  order_type: "dine_in" | "takeaway" | "delivery";
  status: "completed" | "unpaid" | "cancelled";
  kitchen_status: "New" | "Preparing" | "Completed";
  delivery_charge: number;
  created_at: string;
  customers: { name: string } | null;
  employees: { name: string } | null;
  tables: { number: string } | null;
  sale_items: { product_id: string; name: string; unit_price: number; quantity: number }[];
};

const COLUMNS: { key: Sale["kitchen_status"]; label: string; hint: string }[] = [
  { key: "New", label: "Active", hint: "Just fired" },
  { key: "Preparing", label: "Preparing", hint: "On the line" },
  { key: "Completed", label: "Completed", hint: "Ready or served" },
];

const TYPE_LABEL: Record<Sale["order_type"], string> = { dine_in: "Dine In", takeaway: "Takeaway", delivery: "Delivery" };

/**
 * Matches the prototype's ticket-rail.js: three kanban columns (New/Preparing/Completed),
 * move-forward/move-back buttons per card. Auto-refreshes every 5s like the prototype's
 * trStartAutoRefresh(). Scope note: the prototype also shows pre-payment "held" tickets
 * (a cart saved before checkout, still being added to) alongside fired ones — this only
 * shows real sales (including unpaid ones), since a held-cart concept doesn't exist in the
 * data model yet. See migration 0010's header comment.
 */
export function TicketRailClient({ canCancel }: { canCancel: boolean }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [taxRate, setTaxRate] = useState(0.05);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  async function load() {
    const res = await fetch("/api/sales?limit=60");
    const data = await res.json();
    if (res.ok) setSales((data.sales ?? []).filter((s: Sale) => s.status !== "cancelled"));
  }
  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings?.tax_rate != null && setTaxRate(Number(d.settings.tax_rate) / 100));
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function move(saleId: string, kitchenStatus: string) {
    setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, kitchen_status: kitchenStatus as Sale["kitchen_status"] } : s)));
    const res = await fetch("/api/sales/kitchen-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId, kitchenStatus }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      load();
    }
  }

  async function cancelTicket(saleId: string, orderNo: number) {
    if (!confirm(`Cancel order #${orderNo}? This restores its inventory and removes it from today's income.`)) return;
    const res = await fetch("/api/sales/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    load();
  }

  return (
    <main className="p-6 md:p-8">
      {error && <p className="text-crimson-400 text-sm mb-3">{error}</p>}
      <div className="grid md:grid-cols-3 gap-5">
        {COLUMNS.map((col, colIdx) => {
          const items = sales
            .filter((s) => s.kitchen_status === col.key)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return (
            <div key={col.key} className="rounded-xl border border-line bg-surface flex flex-col min-h-[300px]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
                <div>
                  <div className="font-display font-semibold text-sm text-ink-strong">{col.label}</div>
                  <div className="text-[11px] text-ink-faint">{col.hint}</div>
                </div>
                <span className="text-xs font-semibold text-ink-mid bg-raised rounded-full w-6 h-6 flex items-center justify-center">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                {items.length === 0 && <p className="text-xs text-ink-faint text-center py-6">No tickets here.</p>}
                {items.map((s) => (
                  <div key={s.id} className="rounded-lg border border-line bg-raised p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-semibold">#{s.order_no}</span>
                      {s.status === "unpaid" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-turmeric-500/20 text-turmeric-400">UNPAID</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-mid mb-1.5">
                      {TYPE_LABEL[s.order_type]}
                      {s.tables?.number && ` · Table ${s.tables.number}`}
                      {s.customers?.name && ` · ${s.customers.name}`}
                    </div>
                    {s.employees?.name && <div className="text-[10px] text-ink-faint mb-1.5">{s.employees.name}</div>}
                    <div className="text-[11px] text-ink-faint space-y-0.5 mb-2">
                      {s.sale_items.slice(0, 4).map((it, i) => (
                        <div key={i}>
                          {it.quantity}× {it.name}
                        </div>
                      ))}
                      {s.sale_items.length > 4 && <div>+{s.sale_items.length - 4} more</div>}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {colIdx > 0 && (
                          <button
                            onClick={() => move(s.id, COLUMNS[colIdx - 1].key)}
                            className="w-6 h-6 rounded bg-canvas border border-line text-xs hover:border-chili-500"
                            title="Move back"
                          >
                            ‹
                          </button>
                        )}
                        {colIdx < COLUMNS.length - 1 && (
                          <button
                            onClick={() => move(s.id, COLUMNS[colIdx + 1].key)}
                            className="w-6 h-6 rounded bg-canvas border border-line text-xs hover:border-chili-500"
                            title="Move forward"
                          >
                            ›
                          </button>
                        )}
                      </div>
                      {canCancel && (
                        <div className="flex gap-2">
                          <button onClick={() => setEditingSale(s)} className="text-[11px] text-ink-faint hover:text-chili-400">
                            Edit
                          </button>
                          <button onClick={() => cancelTicket(s.id, s.order_no)} className="text-[11px] text-ink-faint hover:text-crimson-400">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
            load();
          }}
        />
      )}
    </main>
  );
}
