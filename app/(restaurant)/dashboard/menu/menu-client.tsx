"use client";
import { useEffect, useState } from "react";
import { X, Pencil, Image as ImageIcon } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, addBtnCls } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { GalleryPickerModal } from "@/components/gallery-picker-modal";
import { fmtMoney } from "@/lib/format";
import { RecipeModal } from "./recipe-modal";

type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Product = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_available: boolean;
  is_deal?: boolean;
  menu_categories?: { name: string } | null;
};

export function MenuClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState("");

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

  async function loadAll() {
    const [catRes, prodRes] = await Promise.all([fetch("/api/menu-categories"), fetch("/api/products")]);
    const catData = await catRes.json();
    const prodData = await prodRes.json();
    if (catRes.ok) setCategories(catData.categories ?? []);
    if (prodRes.ok) setProducts(prodData.products ?? []);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function addCategory() {
    if (!newCatName.trim()) return;
    setCatError("");
    const res = await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name: newCatName.trim(), sort_order: categories.length } }),
    });
    if (!res.ok) {
      setCatError((await res.json()).error);
      return;
    }
    setNewCatName("");
    loadAll();
  }
  async function removeCategory(id: string) {
    const inUse = products.some((p) => p.category_id === id);
    if (inUse) {
      setCatError("Move or remove items in this category first");
      return;
    }
    setCatError("");
    await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    loadAll();
  }

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFCategoryId(categories[0]?.id ?? "");
    setFPrice("0");
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

  async function saveProduct() {
    if (!fName.trim()) {
      setError("Item name is required");
      return;
    }
    if (categories.length === 0) {
      setError("Add a menu category first");
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
          price: Number(fPrice) || 0,
          image_url: fImageUrl.trim() || null,
          is_available: fAvailable,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setModalOpen(false);
    loadAll();
  }

  async function removeProduct(id: string) {
    if (!confirm("Remove this menu item? Its recipe will also be deleted. This cannot be undone.")) return;
    await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    loadAll();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <Panel loading={loading} loadingLabel="Loading menu…">
          <PanelHead title="Menu categories" subtitle="Used to group items in POS" />
          <div className="px-5 py-3 space-y-1">
            {catError && <p className="mb-2 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{catError}</p>}
            {categories.map((c) => {
              const inUse = products.filter((p) => p.category_id === c.id).length;
              return (
                <div key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    {c.name} {inUse > 0 && <span className="text-xs text-ink-mid">({inUse} items)</span>}
                  </span>
                  <button onClick={() => removeCategory(c.id)} className="text-ink-faint hover:text-crimson-400" title="Remove category">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {categories.length === 0 && <p className="text-xs text-ink-faint py-2">No categories yet — add one below.</p>}
          </div>
          <div className="flex gap-2 px-5 pb-4">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="e.g. Combos"
              className={`${inputCls} flex-1`}
            />
            <button onClick={addCategory} className={btnPrimary}>
              Add
            </button>
          </div>
        </Panel>

        <Panel loading={loading} loadingLabel="Loading menu…">
          <PanelHead title="Menu products" subtitle="Image-first cards shown to cashiers in POS">
            <button onClick={openAdd} className={addBtnCls}>
              + Add product
            </button>
          </PanelHead>
          <div className="p-5 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
            {products.filter((p) => !p.is_deal).map((p) => (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-lg border border-line transition hover:-translate-y-0.5 hover:border-chili-500 ${
                  !p.is_available ? "opacity-40" : ""
                }`}
              >
                <div className="h-24 w-full bg-raised bg-cover bg-center" style={p.image_url ? { backgroundImage: `url('${p.image_url}')` } : undefined} />
                <div className="p-3">
                  <div className="mb-1.5 text-[13px] font-bold leading-tight">{p.name}</div>
                  <div className="font-mono text-[13px] font-bold text-basil-400">{fmtMoney(p.price)}</div>
                </div>
                <button
                  onClick={() => openEdit(p)}
                  title="Edit"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-surface/90 border border-line opacity-0 transition group-hover:opacity-100 hover:bg-raised"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {products.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ink-faint">No products yet — add one above.</p>}
          </div>
        </Panel>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        busy={saving}
        title={editingId ? "Edit menu item" : "Add menu item"}
        footer={
          <>
            {editingId && (
              <button
                onClick={() => {
                  setModalOpen(false);
                  removeProduct(editingId);
                }}
                className="mr-auto text-xs text-crimson-400 hover:underline"
              >
                Remove item
              </button>
            )}
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveProduct} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Item name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} placeholder="e.g. Spicy Chicken Wrap" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={fCategoryId} onChange={(e) => setFCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (Rs)">
            <input value={fPrice} onChange={(e) => setFPrice(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
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
          <span className="text-sm font-medium text-ink-strong">Available in POS</span>
          <Switch checked={fAvailable} onChange={setFAvailable} />
        </label>
        {editingId && (
          <button
            onClick={() => {
              const p = products.find((x) => x.id === editingId);
              if (p) setRecipeProduct(p);
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

      {recipeProduct && <RecipeModal productId={recipeProduct.id} productName={recipeProduct.name} onClose={() => setRecipeProduct(null)} />}
    </main>
  );
}