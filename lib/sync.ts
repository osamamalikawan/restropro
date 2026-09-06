"use client";
import { createClient } from "@/lib/supabase/client";
import {
  localGetAll,
  localPutMany,
  enqueueOutbox,
  readOutbox,
  clearOutboxEntry,
} from "@/lib/offline-db";

/**
 * Reference sync engine, demonstrated on `employees`. Read path: instant local read,
 * then background pull + patch. Write path: optimistic local write, queued outbox,
 * flushed to Supabase in the background (and retried on reconnect).
 *
 * To port another module (inventory, sales, ...): add its name to SYNCABLE_STORES in
 * lib/offline-db.ts, add a matching branch in flushOutbox()'s switch, and call
 * pullAndCache(store, restaurantId) the same way employees does below.
 */

export async function readFast<T>(store: "employees", restaurantId: string): Promise<T[]> {
  return localGetAll<T>(store, restaurantId);
}

export async function pullAndCache(store: "employees", restaurantId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(store)
    .select("*")
    .eq("restaurant_id", restaurantId);
  if (error || !data) return; // offline or RLS-denied — local cache stays as the source of truth for now
  await localPutMany(store, data);
}

export async function writeOptimistic(
  store: "employees",
  op: "insert" | "update" | "delete",
  row: any
): Promise<void> {
  const { localPut } = await import("@/lib/offline-db");
  await localPut(store, { ...row, updated_at: new Date().toISOString() });
  await enqueueOutbox({ store, op, row });
  flushOutbox(); // fire-and-forget; safe to call opportunistically
}

let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const supabase = createClient();
    const entries = await readOutbox();
    for (const entry of entries) {
      try {
        if (entry.op === "delete") {
          await supabase.from(entry.store).update({ deleted_at: new Date().toISOString() }).eq("id", entry.row.id);
        } else {
          await supabase.from(entry.store).upsert(entry.row);
        }
        await clearOutboxEntry(entry.outboxId);
      } catch {
        break; // stop on first failure (likely offline) — remaining entries retry next flush
      }
    }
  } finally {
    flushing = false;
  }
}

/** Call once from a layout/page effect: retries the outbox on reconnect and periodically. */
export function startBackgroundSync(store: "employees", restaurantId: string) {
  const interval = setInterval(() => {
    flushOutbox();
    pullAndCache(store, restaurantId);
  }, 30_000);
  const onOnline = () => flushOutbox();
  window.addEventListener("online", onOnline);

  const supabase = createClient();
  const channel = supabase
    .channel(`${store}-${restaurantId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: store, filter: `restaurant_id=eq.${restaurantId}` },
      () => pullAndCache(store, restaurantId)
    )
    .subscribe();

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
    supabase.removeChannel(channel);
  };
}
