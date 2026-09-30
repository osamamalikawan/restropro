import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getTables() {
  if (isTauri()) return invoke<{ id: string; number: string }[]>("get_cached_tables");
  const r = await fetch("/api/tables");
  const d = await r.json();
  return d.tables ?? [];
}

export async function getAreas() {
  if (isTauri()) return invoke<{ id: string; name: string }[]>("get_cached_areas");
  const r = await fetch("/api/delivery-areas");
  const d = await r.json();
  return d.areas ?? [];
}

export async function getSettings() {
  if (isTauri()) return invoke<{ tax_rate: number }>("get_cached_settings");
  const r = await fetch("/api/settings");
  const d = await r.json();
  return d.settings ?? {};
}

export async function getPaymentMethods() {
  if (isTauri()) return invoke<{ name: string }[]>("get_cached_payment_methods");
  const r = await fetch("/api/payment-methods");
  const d = await r.json();
  return d.methods ?? [];
}

export async function searchCustomers(q: string) {
  if (isTauri()) return invoke<{ id: string; name: string; phone: string }[]>("search_local_customers", { q });
  const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  return d.customers ?? [];
}

export async function submitSale(payload: unknown) {
  if (isTauri()) return invoke("create_local_sale", { payload });
  const r = await fetch("/api/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}