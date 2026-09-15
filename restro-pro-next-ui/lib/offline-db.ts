"use client";

/** Minimal IndexedDB wrapper for the local-first cache. One object store per syncable
 *  table, keyed by `id`, plus a generic `_outbox` store for pending writes. Deliberately
 *  tiny (no dependency) — swap for `idb` from npm if you want a nicer promise API later. */

const DB_NAME = "restropro_local";
const DB_VERSION = 1;
export const SYNCABLE_STORES = ["employees", "products"] as const; // extend as you port more modules
type StoreName = (typeof SYNCABLE_STORES)[number] | "_outbox";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      SYNCABLE_STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      });
      if (!db.objectStoreNames.contains("_outbox")) {
        db.createObjectStore("_outbox", { keyPath: "outboxId", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function localGetAll<T>(store: StoreName, restaurantId: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => {
      const rows = (req.result as any[]).filter(
        (r) => r.restaurant_id === restaurantId && !r.deleted_at
      );
      resolve(rows as T[]);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function localPut(store: StoreName, row: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function localPutMany(store: StoreName, rows: any[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    rows.forEach((r) => os.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function enqueueOutbox(entry: {
  store: (typeof SYNCABLE_STORES)[number];
  op: "insert" | "update" | "delete";
  row: any;
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("_outbox", "readwrite");
    tx.objectStore("_outbox").add({ ...entry, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readOutbox(): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("_outbox", "readonly");
    const req = tx.objectStore("_outbox").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearOutboxEntry(outboxId: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("_outbox", "readwrite");
    tx.objectStore("_outbox").delete(outboxId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
