"use client";
import { useEffect, useRef, useState } from "react";
import { IdCard, Pencil, ArrowLeft } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Avatar, Badge, IconBtn, KpiCard, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { LoadMore, useDebounced } from "@/components/ui/load-more";

const PAGE = 50; // customers (and order-history rows) per page

type Area = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; address: string | null; area_id: string | null; delivery_areas?: { name: string } | null };
type SaleItem = { name: string; unit_price: number; quantity: number };
type Sale = { id: string; order_no: number; display_id?: string | null; order_type: string; customer_id: string | null; total: number; status: string; created_at: string; sale_items: SaleItem[] };
type Stat = { orders: number; spend: number; lastOrderAt: string | null };

export function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [areas, setAreas] = useState<Area[]>([]);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const latest = useRef(0); // ignores a slow answer that a newer search/reload has replaced

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fAreaId, setFAreaId] = useState("");
  const [saving, setSaving] = useState(false);

  // Profile drill-down: the customer's order history is fetched only when a profile is opened.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Sale[]>([]);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);

  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset), stats: "1" });
    if (q) params.set("q", q);
    // Per-endpoint fetchJson (see lib/fetch-json.ts): a failure here shows an error, never throws.
    const res = await fetchJson<{ customers: Customer[]; hasMore: boolean; stats?: Record<string, Stat> }>(`/api/customers?${params}`);
    if (id !== latest.current) return;
    if (!res.ok) {
      setLoadError(res.error);
      if (offset === 0) setCustomers([]);
      setLoading(false);
      return;
    }
    setLoadError("");
    const rows = res.data?.customers ?? [];
    setHasMore(!!res.data?.hasMore);
    setCustomers((prev) => (offset === 0 ? rows : [...prev, ...rows]));
    setStats((prev) => ({ ...(offset === 0 ? {} : prev), ...(res.data?.stats ?? {}) }));
    setLoading(false);
  }

  function reload() {
    latest.current += 1;
    setLoading(true);
    return loadPage(0);
  }

  useEffect(() => {
    fetchJson<{ areas: Area[] }>("/api/delivery-areas").then((r) => setAreas(r.ok ? r.data?.areas ?? [] : []));
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(customers.length);
    setLoadingMore(false);
  }

  async function loadOrders(customerId: string, offset: number) {
    setOrdersLoading(true);
    const res = await fetchJson<{ sales: Sale[]; hasMore: boolean }>(`/api/sales?customerId=${customerId}&limit=${PAGE}&offset=${offset}`);
    if (res.ok) {
      const rows = (res.data?.sales ?? []).filter((s) => s.status !== "cancelled");
      setOrders((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setOrdersHasMore(!!res.data?.hasMore);
    }
    setOrdersLoading(false);
  }

  useEffect(() => {
    setOrders([]);
    setOrdersHasMore(false);
    if (profileId) loadOrders(profileId, 0);
  }, [profileId]);

  const statsFor = (customerId: string) => {
    const st = stats[customerId];
    return { totalOrders: st?.orders ?? 0, totalSpend: st?.spend ?? 0, lastOrderAt: st?.lastOrderAt ?? null };
  };

  const filtered = customers; // searching is done on the server, a page at a time

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
    await reload();
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
          <KpiCard label="Last order" value={orders[0] ? `#${orders[0].display_id ?? orders[0].order_no}` : stats.lastOrderAt ? fmtDateTime(stats.lastOrderAt) : "—"} />
        </div>

        <Panel loading={ordersLoading && orders.length === 0}>
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
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <Td className="font-mono font-medium">#{o.display_id ?? o.order_no}</Td>
                    <Td className="text-ink-mid">{fmtDateTime(o.created_at)}</Td>
                    <Td>
                      <Badge>{o.order_type.replace("_", " ")}</Badge>
                    </Td>
                    <Td className="text-ink-mid">{o.sale_items?.length ?? 0} item(s)</Td>
                    <Td className="font-mono font-medium">{fmtMoney(o.total)}</Td>
                  </tr>
                ))}
                {!ordersLoading && orders.length === 0 && <EmptyRow colSpan={5} label="No orders yet." />}
              </tbody>
            </table>
          </TableScroll>
          <LoadMore hasMore={ordersHasMore} loading={ordersLoading} onMore={() => profileId && loadOrders(profileId, orders.length)} />
        </Panel>

        {renderModal()}
      </main>
    );
  }

  function renderModal() {
    return (
      <Modal
        busy={saving}
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
      <Panel loading={loading}>
        <PanelHead title="Customers" subtitle="Everyone who has ordered with you">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…" className={searchInputCls} />
          <button onClick={openAdd} className={addBtnCls}>
            + Add customer
          </button>
        </PanelHead>
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load customers: {loadError}
          </p>
        )}
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
                    <Td className="text-ink-mid">{stats.lastOrderAt ? fmtDateTime(stats.lastOrderAt) : "—"}</Td>
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
              {!loading && !loadError && filtered.length === 0 && <EmptyRow colSpan={7} label={q ? "No customers match your search." : "No customers yet."} />}
            </tbody>
          </table>
        </TableScroll>
        <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} />
      </Panel>

      {renderModal()}
    </main>
  );
}
