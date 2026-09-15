"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RecipeModal } from "./recipe-modal";

type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Product = { id: string; name: string; price: number; category_id: string | null; is_available: boolean; menu_categories?: { name: string } | null };

export function MenuClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newProdName, setNewProdName] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdCategory, setNewProdCategory] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    const [catRes, prodRes] = await Promise.all([fetch("/api/menu-categories"), fetch("/api/products")]);
    const catData = await catRes.json();
    const prodData = await prodRes.json();
    if (catRes.ok) setCategories(catData.categories ?? []);
    if (prodRes.ok) setProducts(prodData.products ?? []);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function addCategory() {
    if (!newCatName.trim()) return;
    setError("");
    const res = await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name: newCatName.trim(), sort_order: categories.length } }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setNewCatName("");
    loadAll();
  }
  async function removeCategory(id: string) {
    await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    loadAll();
  }

  async function addProduct() {
    if (!newProdName.trim() || !newProdPrice) return;
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "insert",
        row: { name: newProdName.trim(), price: Number(newProdPrice), category_id: newProdCategory || null, is_available: true },
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setNewProdName("");
    setNewProdPrice("");
    loadAll();
  }
  async function toggleAvailable(p: Product) {
    await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", row: { id: p.id, is_available: !p.is_available } }),
    });
    loadAll();
  }
  async function removeProduct(id: string) {
    await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    loadAll();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Menu</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-display font-semibold mb-3">Categories</h2>
          <div className="space-y-2 mb-4">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-neutral-800 pb-2">
                <span>{c.name}</span>
                <button onClick={() => removeCategory(c.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-neutral-500 text-sm">No categories yet.</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Burgers"
              className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
            />
            <button onClick={addCategory} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-3">
              Add
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-display font-semibold mb-3">Products</h2>
          <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-neutral-800 pb-2">
                <div>
                  <div>{p.name}</div>
                  <div className="text-neutral-500 text-xs">
                    Rs {p.price} · {p.menu_categories?.name ?? "Uncategorized"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAvailable(p)}
                    className={`text-xs px-2 py-1 rounded-full ${p.is_available ? "bg-basil-500/20 text-basil-400" : "bg-neutral-800 text-neutral-500"}`}
                  >
                    {p.is_available ? "Available" : "Hidden"}
                  </button>
                  <button onClick={() => setRecipeProduct(p)} className="text-neutral-500 hover:text-turmeric-400 text-xs">
                    Recipe
                  </button>
                  <button onClick={() => removeProduct(p.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {products.length === 0 && <p className="text-neutral-500 text-sm">No products yet.</p>}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                placeholder="Product name"
                className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
              />
              <input
                value={newProdPrice}
                onChange={(e) => setNewProdPrice(e.target.value)}
                placeholder="Price"
                type="number"
                className="w-24 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button onClick={addProduct} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-3">
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {recipeProduct && (
        <RecipeModal productId={recipeProduct.id} productName={recipeProduct.name} onClose={() => setRecipeProduct(null)} />
      )}
    </main>
  );
}
