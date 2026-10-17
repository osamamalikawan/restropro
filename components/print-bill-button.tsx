"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { printSimpleSlip, type SlipRow } from "@/lib/posPrint";
import { getSlipContext } from "@/lib/print-context";

/** A small "Print" button for a table row. `bill` builds the bill's title and rows; the restaurant name and paper size
 *  are added here. Prints on the receipt printer in the desktop app, or opens the browser's print dialog on the web. */
export function PrintBillButton({ bill, label = "Print bill" }: { bill: () => { title: string; rows: SlipRow[] }; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function print() {
    setBusy(true);
    setMsg(null);
    try {
      const ctx = await getSlipContext();
      const b = bill();
      const where = await printSimpleSlip({ ...ctx, title: b.title, rows: b.rows });
      setMsg({ ok: true, text: where === "printer" ? "Sent to the printer" : "Print dialog opened" });
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't print: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        onClick={print}
        disabled={busy}
        title={label}
        aria-label={label}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 text-xs font-semibold text-ink-mid hover:border-chili-500/60 hover:text-ink-strong disabled:opacity-50"
      >
        <Printer className="h-3.5 w-3.5" />
        {busy ? "…" : "Print"}
      </button>
      {msg && <span className={`absolute right-0 top-9 z-10 w-48 rounded-md border bg-surface px-2 py-1 text-[11px] shadow-lg ${msg.ok ? "border-basil-500/40 text-basil-400" : "border-crimson-500/40 text-crimson-400"}`}>{msg.text}</span>}
    </div>
  );
}
