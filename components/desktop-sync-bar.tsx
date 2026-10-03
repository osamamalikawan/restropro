"use client";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/posData";
import { useOnline } from "@/lib/desktop/connectivity";

type SyncStatus = {
  last_sync_at: string | null;
  hours_since_sync: number | null;
  hours_left: number | null;
  pending_sales: number;
  rejected_sales: number;
  locked: boolean;
  lock_reason: string | null;
  last_error: string | null;
};

/** Desktop-only strip: shows when the POS last synced, how many sales are waiting to upload,
 *  and blocks the screen once the 3-day offline limit is reached (the Rust side enforces the
 *  same rule, so hiding this component doesn't unlock selling). */
export function DesktopSyncBar() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const { online } = useOnline();

  const refresh = useCallback(() => {
    invoke<SyncStatus>("get_sync_status").then(setSt).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function syncNow(retryRejected = false) {
    setBusy(true);
    setMsg("");
    try {
      setSt(await invoke<SyncStatus>("sync_now", { retryRejected }));
    } catch (e) {
      setMsg(typeof e === "string" ? e : "Sync failed");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isTauri() || !st) return null;

  const warn = st.pending_sales > 0 || st.rejected_sales > 0 || (st.hours_left ?? 99) <= 24;
  const label = st.last_sync_at
    ? `Synced ${st.hours_since_sync === 0 ? "just now" : `${st.hours_since_sync}h ago`}`
    : "Never synced";

  return (
    <>
      {st.locked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
            <h2 className="font-display text-lg font-semibold mb-2">Sync required</h2>
            <p className="text-sm text-ink-faint mb-4">{st.lock_reason}</p>
            {st.pending_sales > 0 && (
              <p className="text-sm mb-4">{st.pending_sales} sale(s) are saved on this device and will upload during the sync.</p>
            )}
            {msg && <p className="text-sm text-chili-500 mb-3">{msg}</p>}
            <button
              onClick={() => syncNow()}
              disabled={busy}
              className="rounded-lg bg-chili-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
      )}
      <div
        className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5 text-xs ${
          warn ? "border-turmeric-400/50 text-turmeric-400" : "border-line text-ink-faint"
        }`}
      >
        {!online && (
          <span className="rounded-full bg-turmeric-500/20 px-2 py-0.5 font-semibold text-turmeric-400">Offline</span>
        )}
        <span>{label}</span>
        {st.hours_left != null && st.hours_left <= 24 && <span>· {st.hours_left}h left before sync is required</span>}
        {st.pending_sales > 0 && <span>· {st.pending_sales} sale(s) waiting to upload</span>}
        {st.rejected_sales > 0 && (
          <button className="underline" onClick={() => syncNow(true)} disabled={busy}>
            {st.rejected_sales} rejected — retry
          </button>
        )}
        {(st.last_error || msg) && <span className="truncate">· {msg || st.last_error}</span>}
        <button className="ml-auto underline" onClick={() => syncNow()} disabled={busy}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </>
  );
}
