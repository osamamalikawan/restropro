"use client";
import { useEffect, useMemo, useState } from "react";
import { IdCard, Pencil, ArrowLeft } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Avatar, Badge, IconBtn, KpiCard, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { fmtMoney, fmtDateTime } from "@/lib/format";

type Area = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; address: string | null; area_id: string | null; delivery_areas?: { name: string } | null };
type SaleItem = { name: string; unit_price: number; quantity: number };
type Sale = { id: string; order_no: number; order_type: string; customer_id: string | null; total: number; status: string; created_at: string; sale_items: SaleItem[] };

export function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fAreaId, setFAreaId] = useState("");
  const [saving, setSaving] = useState(false);

  // Profile drill-down
  const [profileId, setProfileId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [cRes, aRes, sRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/delivery-areas"),
      fetch("/api/sales?limit=1000"),
    ]);
    const [c, a, s] = await Promise.all([cRes.json(), aRes.json(), sRes.json()]);
    setCustomers(c.customers ?? []);
    setAreas(a.areas ?? []);
    setSales(s.sales ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const statsFor = (customerId: string) => {
    const orders = sales.filter((s) => s.customer_id === customerId && s.status !== "cancelled");
    const totalSpend = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const lastOrder = orders[0] ?? null; // sales already ordered newest-first by the API
    return { totalOrders: orders.length, totalSpend, lastOrder, orders };
  };

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(query) || c.phone.includes(query));
  }, [customers, q]);

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFPhone("");
    setFAddress("");
    setFAreaId("");
    setError("");
    setModalOpen(true);
  }
  function openEdit(c: Customer) {
    setEditingId(c.id);
    setFName(c.name);
    setFPhone(c.phone);
    setFAddress(c.address ?? "");
    setFAreaId(c.area_id ?? "");
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fName.trim() || !fPhone.trim()) {
      setError("Name and phone are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: { id: editingId ?? undefined, name: fName.trim(), phone: fPhone.trim(), address: fAddress.trim() || null, area_id: fAreaId || null },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save customer");
      return;
    }
    setModalOpen(false);
    await load();
  }

  const profileCustomer = profileId ? customers.find((c) => c.id === profileId) : null;

  if (profileCustomer) {
    const stats = statsFor(profileCustomer.id);
    return (
      <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
        <button onClick={() => setProfileId(null)} className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink-strong">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
        </button>

        <div className="flex items-center gap-4 mb-6">
          <Avatar id={profileCustomer.id} name={profileCustomer.name} size={56} />
          <div>
            <h1 className="font-display text-2xl font-semibold">{profileCustomer.name}</h1>
            <div className="text-sm text-ink-mid">
              {profileCustomer.phone}
              {" · "}
              {[profileCustomer.address, profileCustomer.delivery_areas?.name].filter(Boolean).join(", ") || "—"}
            </div>
          </div>
          <button onClick={() => openEdit(profileCustomer)} className={`${btnGhost} ml-auto`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard label="Total orders" value={stats.totalOrders} />
          <KpiCard label="Total spend" value={fmtMoney(stats.totalSpend)} />
          <KpiCard label="Last order" value={stats.lastOrder ? `#${stats.lastOrder.order_no}` : "—"} />
        </div>

        <Panel>
          <PanelHead title="Order history" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Order</Th>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Items</Th>
                  <Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {stats.orders.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <Td className="font-mono font-medium">#{o.order_no}</Td>
                    <Td className="text-ink-mid">{fmtDateTime(o.created_at)}</Td>
                    <Td>
                      <Badge>{o.order_type.replace("_", " ")}</Badge>
                    </Td>
                    <Td className="text-ink-mid">{o.sale_items?.length ?? 0} item(s)</Td>
                    <Td className="font-mono font-medium">{fmtMoney(o.total)}</Td>
                  </tr>
                ))}
                {stats.orders.length === 0 && <EmptyRow colSpan={5} label="No orders yet." />}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        {renderModal()}
      </main>
    );
  }

  function renderModal() {
    return (
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit customer" : "Add customer"}
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
        <Field label="Name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} placeholder="Full name" />
        </Field>
        <Field label="Phone">
          <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} className={inputCls} placeholder="03xx-xxxxxxx" />
        </Field>
        <Field label="Address">
          <input value={fAddress} onChange={(e) => setFAddress(e.target.value)} className={inputCls} placeholder="Street address" />
        </Field>
        <Field label="Delivery area">
          <select value={fAreaId} onChange={(e) => setFAreaId(e.target.value)} className={inputCls}>
            <option value="">No delivery area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel>
        <PanelHead title="Customers" subtitle="Everyone who has ordered with you">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" className={searchInputCls} />
          <button onClick={openAdd} className={addBtnCls}>
            + Add customer
          </button>
        </PanelHead>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Customer</Th>
                <Th>Address</Th>
                <Th>Area</Th>
                <Th>Orders</Th>
                <Th>Total spend</Th>
                <Th>Last order</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const stats = statsFor(c.id);
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar id={c.id} name={c.name} />
                        <div>
                          <div className="font-medium text-ink-strong">{c.name}</div>
                          <div className="text-xs text-ink-mid">{c.phone}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-ink-mid">{c.address || "—"}</Td>
                    <Td className="text-ink-mid">{c.delivery_areas?.name ?? "—"}</Td>
                    <Td>{stats.totalOrders}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(stats.totalSpend)}</Td>
                    <Td className="text-ink-mid">{stats.lastOrder ? fmtDateTime(stats.lastOrder.created_at) : "—"}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <IconBtn title="View" onClick={() => setProfileId(c.id)}>
                          <IdCard className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Edit" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && <EmptyRow colSpan={7} label="No customers yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {renderModal()}
    </main>
  );
}
