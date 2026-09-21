"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, NotebookText, Image as ImageIcon } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, IconBtn, searchInputCls, addBtnCls } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { GalleryPickerModal } from "@/components/gallery-picker-modal";
import { fmtMoney } from "@/lib/format";
import { RecipeModal } from "../menu/recipe-modal";

type Category = { id: string; name: string };
type Product = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  menu_categories?: { name: string } | null;
};
type RecipeItem = { product_id: string; quantity: number; inventory_items: { cost: number } | null };

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

  async function load() {
    setLoading(true);
    const [pRes, cRes, rRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/menu-categories"),
      fetch("/api/recipes"),
    ]);
    const [p, c, r] = await Promise.all([pRes.json(), cRes.json(), rRes.json()]);
    setProducts(p.products ?? []);
    setCategories(c.categories ?? []);
    setRecipeItems(r.recipeItems ?? []);
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
    return products.filter((p) => p.name.toLowerCase().includes(query));
  }, [products, q]);

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
              {!loading && filtered.length === 0 && <EmptyRow colSpan={8} label="No products yet." />}
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
    </main>
  );
}
