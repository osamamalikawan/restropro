"use client";
import { useEffect, useMemo, useState } from "react";
import { IdCard, Pencil, ArrowLeft } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Avatar, Badge, IconBtn, KpiCard, addBtnCls } from "@/components/ui/panel";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

type Supplier = { id: string; name: string; contact_person: string | null; phone: string | null; category: string | null; payment_terms: string | null };
type Purchase = { supplier_id: string | null; total_cost: number; inventory_items?: { name: string; unit: string } | null; unit_cost: number };
type LedgerEntry = { id: string; supplier_id: string; amount: number; method: string; note: string | null; txn_date: string };

export function SuppliersClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fContact, setFContact] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fTerms, setFTerms] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    const [sRes, pRes, lRes] = await Promise.all([
      fetchJson<{ suppliers: Supplier[] }>("/api/suppliers"),
      fetchJson<{ purchases: Purchase[] }>("/api/restock?limit=1000"),
      fetchJson<{ entries: LedgerEntry[] }>("/api/supplier-ledger?limit=1000"),
    ]);
    if (!sRes.ok) {
      setLoadError(sRes.error);
      setSuppliers([]);
    } else {
      setSuppliers(sRes.data?.suppliers ?? []);
    }
    setPurchases(pRes.ok ? pRes.data?.purchases ?? [] : []);
    setLedger(lRes.ok ? lRes.data?.entries ?? [] : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFContact("");
    setFPhone("");
    setFCategory("");
    setFTerms("");
    setError("");
    setModalOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setFName(s.name);
    setFContact(s.contact_person ?? "");
    setFPhone(s.phone ?? "");
    setFCategory(s.category ?? "");
    setFTerms(s.payment_terms ?? "");
    setError("");
    setModalOpen(true);
  }
  async function save() {
    if (!fName.trim()) {
      setError("Company name is required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: { id: editingId ?? undefined, name: fName.trim(), contact_person: fContact.trim() || null, phone: fPhone.trim() || null, category: fCategory.trim() || null, payment_terms: fTerms.trim() || null },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save supplier");
      return;
    }
    setModalOpen(false);
    await load();
  }

  const profile = profileId ? suppliers.find((s) => s.id === profileId) : null;

  if (profile) {
    const payments = ledger.filter((l) => l.supplier_id === profile.id);
    const totalPaid = payments.reduce((s, l) => s + Number(l.amount), 0);
    const supplierPurchases = purchases.filter((p) => p.supplier_id === profile.id);
    const totalPurchased = supplierPurchases.reduce((s, p) => s + Number(p.total_cost), 0);
    const itemsLinked = new Set(supplierPurchases.map((p) => p.inventory_items?.name)).size;

    return (
      <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
        <button onClick={() => setProfileId(null)} className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink-strong">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to suppliers
        </button>
        <div className="flex items-center gap-4 mb-6">
          <Avatar id={profile.id} name={profile.name} size={56} />
          <div>
            <h1 className="font-display text-2xl font-semibold">{profile.name}</h1>
            <div className="flex gap-2 mt-1">
              {profile.category && <Badge tone="turmeric">{profile.category}</Badge>}
              {profile.payment_terms && <Badge>{profile.payment_terms}</Badge>}
            </div>
            <div className="text-sm text-ink-mid mt-1">
              {profile.contact_person || "—"} · {profile.phone || "—"}
            </div>
          </div>
          <button onClick={() => openEdit(profile)} className={`${btnGhost} ml-auto`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total paid" value={fmtMoney(totalPaid)} />
          <KpiCard label="Items linked" value={itemsLinked} />
          <KpiCard label="Total purchased" value={fmtMoney(totalPurchased)} />
          <KpiCard label="Outstanding payable" value={fmtMoney(Math.max(0, totalPurchased - totalPaid))} />
        </div>

        <Panel loading={loading}>
          <PanelHead title="Payment history" />
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Date</Th>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <Td className="text-ink-mid">{l.txn_date}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(l.amount)}</Td>
                    <Td>
                      <Badge>{l.method}</Badge>
                    </Td>
                    <Td className="text-ink-mid">{l.note || "—"}</Td>
                  </tr>
                ))}
                {payments.length === 0 && <EmptyRow colSpan={4} label="No payments logged yet." />}
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
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit supplier" : "Add supplier"}
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
        <Field label="Company name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Contact person">
          <input value={fContact} onChange={(e) => setFContact(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Category">
          <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls} placeholder="e.g. Meat, Dairy…" />
        </Field>
        <Field label="Payment terms">
          <input value={fTerms} onChange={(e) => setFTerms(e.target.value)} className={inputCls} placeholder="e.g. Net 15" />
        </Field>
      </Modal>
    );
  }

  const suppliersPage = usePagination(suppliers, 20);

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead title="Suppliers" subtitle="Vendors supplying stock and ingredients">
          <button onClick={openAdd} className={addBtnCls}>
            + Add supplier
          </button>
        </PanelHead>
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load suppliers: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Supplier</Th>
                <Th>Contact</Th>
                <Th>Category</Th>
                <Th>Terms</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {suppliersPage.pageItems.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <Td className="font-medium text-ink-strong">{s.name}</Td>
                  <Td>
                    {s.contact_person || "—"}
                    <div className="text-xs text-ink-mid">{s.phone}</div>
                  </Td>
                  <Td>{s.category && <Badge tone="turmeric">{s.category}</Badge>}</Td>
                  <Td className="text-ink-mid">{s.payment_terms || "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <IconBtn title="View profile" onClick={() => setProfileId(s.id)}>
                        <IdCard className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Edit" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              ))}
              {!loading && suppliers.length === 0 && <EmptyRow colSpan={5} label="No suppliers yet." />}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={suppliersPage.page} pageCount={suppliersPage.pageCount} onChange={suppliersPage.setPage} total={suppliersPage.total} pageSize={suppliersPage.pageSize} />
      </Panel>

      {renderModal()}
    </main>
  );
}
