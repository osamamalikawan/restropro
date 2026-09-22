"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, NotebookText, Image as ImageIcon } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { GalleryPickerModal } from "@/components/gallery-picker-modal";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { RecipeModal } from "../menu/recipe-modal";

type Category = { id: string; name: string };
type Product = {
  id: string;
  category_id: string | null;
  name: string;
  description?: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_deal?: boolean;
  menu_categories?: { name: string } | null;
};
type RecipeItem = { product_id: string; quantity: number; inventory_items: { cost: number } | null };
type Deal = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  deal_items: { id: string; quantity: number; component_product_id: string; component: { id: string; name: string; price: number } | null }[];
};

export function ProductsClient({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fCategoryId, setFCategoryId] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fImageUrl, setFImageUrl] = useState("");
  const [fAvailable, setFAvailable] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState("");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [dName, setDName] = useState("");
  const [dDescription, setDDescription] = useState("");
  const [dPrice, setDPrice] = useState("");
  const [dImageUrl, setDImageUrl] = useState("");
  const [dAvailable, setDAvailable] = useState(true);
  const [dComponents, setDComponents] = useState<{ productId: string; quantity: number }[]>([]);
  const [dGalleryOpen, setDGalleryOpen] = useState(false);
  const [dError, setDError] = useState("");
  const [dSaving, setDSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError("");
    const [pRes, cRes, rRes, dRes] = await Promise.all([
      fetchJson<{ products: Product[] }>("/api/products"),
      fetchJson<{ categories: Category[] }>("/api/menu-categories"),
      fetchJson<{ recipeItems: RecipeItem[] }>("/api/recipes"),
      fetchJson<{ deals: Deal[] }>("/api/deals"),
    ]);
    if (!pRes.ok) {
      setLoadError(pRes.error);
      setProducts([]);
    } else {
      setProducts(pRes.data?.products ?? []);
    }
    setCategories(cRes.ok ? cRes.data?.categories ?? [] : []);
    setRecipeItems(rRes.ok ? rRes.data?.recipeItems ?? [] : []);
    setDeals(dRes.ok ? dRes.data?.deals ?? [] : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // computeMenuCost — 1:1 with the prototype: sum(recipe line qty * ingredient cost); null
  // (shown as "No recipe") when the product has no recipe lines at all.
  const costFor = (productId: string) => {
    const lines = recipeItems.filter((r) => r.product_id === productId);
    if (lines.length === 0) return null;
    return lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.inventory_items?.cost ?? 0), 0);
  };

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return products.filter((p) => !p.is_deal && p.name.toLowerCase().includes(query));
  }, [products, q]);

  // Only regular (non-deal) available-or-not products can go into a deal's composition —
  // deals are not nestable in v1.
  const componentOptions = useMemo(() => products.filter((p) => !p.is_deal), [products]);

  function openAddDeal() {
    setEditingDealId(null);
    setDName("");
    setDDescription("");
    setDPrice("");
    setDImageUrl("");
    setDAvailable(true);
    setDComponents([]);
    setDError("");
    setDealModalOpen(true);
  }
  function openEditDeal(d: Deal) {
    setEditingDealId(d.id);
    setDName(d.name);
    setDDescription(d.description ?? "");
    setDPrice(String(d.price));
    setDImageUrl(d.image_url ?? "");
    setDAvailable(d.is_available);
    setDComponents(d.deal_items.map((di) => ({ productId: di.component_product_id, quantity: Number(di.quantity) })));
    setDError("");
    setDealModalOpen(true);
  }
  function addComponentRow() {
    const firstUnused = componentOptions.find((p) => !dComponents.some((c) => c.productId === p.id));
    if (!firstUnused) return;
    setDComponents((prev) => [...prev, { productId: firstUnused.id, quantity: 1 }]);
  }
  function removeComponentRow(idx: number) {
    setDComponents((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateComponentRow(idx: number, patch: Partial<{ productId: string; quantity: number }>) {
    setDComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function saveDeal() {
    if (!dName.trim()) {
      setDError("Deal name is required");
      return;
    }
    if (dComponents.length < 2) {
      setDError("A deal needs at least 2 products");
      return;
    }
    setDSaving(true);
    setDError("");
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingDealId ? "update" : "insert",
        id: editingDealId ?? undefined,
        name: dName.trim(),
        description: dDescription.trim() || null,
        price: Number(dPrice) || 0,
        imageUrl: dImageUrl.trim() || null,
        isAvailable: dAvailable,
        components: dComponents,
      }),
    });
    setDSaving(false);
    if (!res.ok) {
      setDError((await res.json()).error ?? "Could not save deal");
      return;
    }
    setDealModalOpen(false);
    await load();
  }
  async function removeDeal(id: string) {
    if (!confirm("Remove this deal? This cannot be undone.")) return;
    await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", id }),
    });
    await load();
  }

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFCategoryId(categories[0]?.id ?? "");
    setFPrice("");
    setFImageUrl("");
    setFAvailable(true);
    setError("");
    setModalOpen(true);
  }
  function openEdit(p: Product) {
    setEditingId(p.id);
    setFName(p.name);
    setFCategoryId(p.category_id ?? "");
    setFPrice(String(p.price));
    setFImageUrl(p.image_url ?? "");
    setFAvailable(p.is_available);
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fName.trim() || !fPrice) {
      setError("Name and selling price are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: {
          id: editingId ?? undefined,
          name: fName.trim(),
          category_id: fCategoryId || null,
          price: Number(fPrice),
          image_url: fImageUrl.trim() || null,
          is_available: fAvailable,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save product");
      return;
    }
    setModalOpen(false);
    await load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead title="Products" subtitle="Cost price is calculated automatically from each item's recipe">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…" className={searchInputCls} />
          {canEdit && (
            <button onClick={openAdd} className={addBtnCls}>
              + Add product
            </button>
          )}
        </PanelHead>
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load products: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th />
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>Cost price</Th>
                <Th>Selling price</Th>
                <Th>Margin</Th>
                <Th>Available</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const cost = costFor(p.id);
                const margin = cost != null ? Number(p.price) - cost : null;
                const marginPct = cost != null && p.price > 0 ? Math.round((margin! / p.price) * 100) : null;
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <Td>
                      <div
                        className="h-9 w-14 rounded-md bg-raised bg-cover bg-center border border-line"
                        style={p.image_url ? { backgroundImage: `url('${p.image_url}')` } : undefined}
                      />
                    </Td>
                    <Td className="font-medium text-ink-strong">{p.name}</Td>
                    <Td>
                      <Badge>{p.menu_categories?.name ?? "—"}</Badge>
                    </Td>
                    <Td className="font-mono text-ink-mid">{cost != null ? fmtMoney(cost) : <span className="text-ink-faint">No recipe</span>}</Td>
                    <Td className="font-mono font-medium">{fmtMoney(p.price)}</Td>
                    <Td className={`font-mono ${margin == null ? "text-ink-faint" : margin >= 0 ? "text-basil-400" : "text-crimson-400"}`}>
                      {margin != null ? `${fmtMoney(margin)} (${marginPct}%)` : "—"}
                    </Td>
                    <Td>
                      <Badge tone={p.is_available ? "basil" : "crimson"}>{p.is_available ? "Yes" : "Hidden"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <IconBtn title="View recipe" onClick={() => router.push(`/dashboard/recipes-production?productId=${p.id}`)}>
                          <NotebookText className="h-3.5 w-3.5" />
                        </IconBtn>
                        {canEdit && (
                          <IconBtn title="Edit" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconBtn>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {!loading && !loadError && filtered.length === 0 && <EmptyRow colSpan={8} label="No products yet." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Panel loading={loading} loadingLabel="">
        <PanelHead title="Deals" subtitle="Bundle two or more products at a special price — shown to customers under the Deals category">
          {canEdit && (
            <button onClick={openAddDeal} className={addBtnCls}>
              + Add deal
            </button>
          )}
        </PanelHead>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th />
                <Th>Deal</Th>
                <Th>Includes</Th>
                <Th>Price</Th>
                <Th>Available</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <Td>
                    <div
                      className="h-9 w-14 rounded-md bg-raised bg-cover bg-center border border-line"
                      style={d.image_url ? { backgroundImage: `url('${d.image_url}')` } : undefined}
                    />
                  </Td>
                  <Td>
                    <div className="font-medium text-ink-strong">{d.name}</div>
                    {d.description && <div className="text-xs text-ink-mid mt-0.5">{d.description}</div>}
                  </Td>
                  <Td className="text-ink-mid text-xs">
                    {d.deal_items.map((di) => `${di.quantity}× ${di.component?.name ?? "—"}`).join(", ")}
                  </Td>
                  <Td className="font-mono font-medium">{fmtMoney(d.price)}</Td>
                  <Td>
                    <Badge tone={d.is_available ? "basil" : "crimson"}>{d.is_available ? "Yes" : "Hidden"}</Badge>
                  </Td>
                  <Td>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <IconBtn title="Edit" onClick={() => openEditDeal(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Remove" onClick={() => removeDeal(d.id)}>
                          ✕
                        </IconBtn>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {!loading && deals.length === 0 && <EmptyRow colSpan={6} label="No deals yet — bundle products above into a deal." />}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Modal
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit product" : "Add product"}
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
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} placeholder="Product name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={fCategoryId} onChange={(e) => setFCategoryId(e.target.value)} className={inputCls}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Selling price">
            <input value={fPrice} onChange={(e) => setFPrice(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-mid">Photo</span>
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
              {fImageUrl ? (
                <img src={fImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-faint">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <button type="button" onClick={() => setGalleryOpen(true)} className={btnGhost}>
              🖼 Choose from Master Gallery
            </button>
          </div>
          <p className="mb-1.5 text-[11px] text-ink-faint">Or paste an image URL below — uploading/choosing a photo takes priority.</p>
          <input value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} className={inputCls} placeholder="https://…" />
        </div>

        <label className="flex items-center justify-between pt-1">
          <span className="text-sm font-medium text-ink-strong">Available on the menu</span>
          <Switch checked={fAvailable} onChange={setFAvailable} />
        </label>
        {editingId && (
          <button
            onClick={() => {
              const p = products.find((x) => x.id === editingId);
              if (p) {
                setModalOpen(false);
                setRecipeProduct(p);
              }
            }}
            className="text-xs font-medium text-chili-500 hover:underline"
          >
            Edit recipe & cost →
          </button>
        )}
      </Modal>

      {galleryOpen && (
        <GalleryPickerModal
          onClose={() => setGalleryOpen(false)}
          onPick={(url) => {
            setFImageUrl(url);
            setGalleryOpen(false);
          }}
        />
      )}

      {recipeProduct && (
        <RecipeModal
          productId={recipeProduct.id}
          productName={recipeProduct.name}
          onClose={() => {
            setRecipeProduct(null);
            load();
          }}
        />
      )}

      <Modal
        busy={dSaving}
        open={dealModalOpen}
        onClose={() => setDealModalOpen(false)}
        title={editingDealId ? "Edit deal" : "Add deal"}
        footer={
          <>
            <button onClick={() => setDealModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveDeal} disabled={dSaving} className={btnPrimary}>
              {dSaving ? "Saving…" : "Save deal"}
            </button>
          </>
        }
      >
        {dError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{dError}</p>}
        <Field label="Deal name">
          <input value={dName} onChange={(e) => setDName(e.target.value)} className={inputCls} placeholder="e.g. Burger + Fries Combo" />
        </Field>
        <Field label="Description">
          <textarea
            value={dDescription}
            onChange={(e) => setDDescription(e.target.value)}
            className={inputCls}
            rows={2}
            placeholder="What's in it, for the customer to see"
          />
        </Field>
        <Field label="Deal price (Rs)">
          <input value={dPrice} onChange={(e) => setDPrice(e.target.value)} type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-mid">Photo</span>
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
              {dImageUrl ? (
                <img src={dImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-faint">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <button type="button" onClick={() => setDGalleryOpen(true)} className={btnGhost}>
              🖼 Choose from Master Gallery
            </button>
          </div>
          <p className="mb-1.5 text-[11px] text-ink-faint">Or paste an image URL below — uploading/choosing a photo takes priority.</p>
          <input value={dImageUrl} onChange={(e) => setDImageUrl(e.target.value)} className={inputCls} placeholder="https://…" />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-mid">Products in this deal (at least 2)</span>
          <div className="space-y-2">
            {dComponents.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={c.productId}
                  onChange={(e) => updateComponentRow(idx, { productId: e.target.value })}
                  className={`${inputCls} flex-1`}
                >
                  {componentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={c.quantity}
                  onChange={(e) => updateComponentRow(idx, { quantity: +e.target.value || 1 })}
                  className={`${inputCls} w-20`}
                />
                <button type="button" onClick={() => removeComponentRow(idx)} className="text-ink-faint hover:text-crimson-400" title="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addComponentRow}
            disabled={componentOptions.length === 0}
            className="mt-2 text-xs font-medium text-chili-500 hover:underline disabled:opacity-50"
          >
            + Add product to deal
          </button>
        </div>

        <label className="flex items-center justify-between pt-1">
          <span className="text-sm font-medium text-ink-strong">Active</span>
          <Switch checked={dAvailable} onChange={setDAvailable} />
        </label>
      </Modal>

      {dGalleryOpen && (
        <GalleryPickerModal
          onClose={() => setDGalleryOpen(false)}
          onPick={(url) => {
            setDImageUrl(url);
            setDGalleryOpen(false);
          }}
        />
      )}
    </main>
  );
}