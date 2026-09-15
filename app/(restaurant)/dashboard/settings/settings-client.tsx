"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function SettingsClient() {
  const [taxRate, setTaxRate] = useState("5");
  const [serviceChargeRate, setServiceChargeRate] = useState("10");
  const [printerName, setPrinterName] = useState("");
  const [paperWidth, setPaperWidth] = useState("80mm");
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (res.ok && data.settings) {
        const s = data.settings;
        setTaxRate(String(s.tax_rate));
        setServiceChargeRate(String(s.service_charge_rate));
        setPrinterName(s.printer_name ?? "");
        setPaperWidth(s.paper_width ?? "80mm");
        setReceiptHeader(s.receipt_header ?? "");
        setReceiptFooter(s.receipt_footer ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taxRate: Number(taxRate),
        serviceChargeRate: Number(serviceChargeRate),
        printerName,
        paperWidth,
        receiptHeader,
        receiptFooter,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-canvas text-ink-strong p-8">
        <p className="text-ink-faint text-sm">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <Link href="/dashboard" className="text-xs text-ink-mid underline hover:text-ink-strong">
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6 space-y-5">
        <div>
          <h2 className="font-display font-semibold mb-3">Tax &amp; charges</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax rate (%)">
              <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} type="number" step="0.1" className="input" />
            </Field>
            <Field label="Dine-in service charge (%)">
              <input value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} type="number" step="0.1" className="input" />
            </Field>
          </div>
          <p className="text-xs text-ink-faint mt-2">
            This tax rate is applied at checkout by <code>app/api/sales/route.ts</code>. Service
            charge isn't wired into checkout yet — that needs the Dine In table selector on POS
            to also apply it (see the README's remaining-modules prompt).
          </p>
        </div>

        <div className="border-t border-line pt-5">
          <h2 className="font-display font-semibold mb-3">Printer &amp; receipt</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Printer name">
              <input value={printerName} onChange={(e) => setPrinterName(e.target.value)} className="input" />
            </Field>
            <Field label="Paper width">
              <select value={paperWidth} onChange={(e) => setPaperWidth(e.target.value)} className="input">
                <option>80mm</option>
                <option>58mm</option>
              </select>
            </Field>
          </div>
          <Field label="Receipt header note">
            <input value={receiptHeader} onChange={(e) => setReceiptHeader(e.target.value)} className="input" />
          </Field>
          <Field label="Receipt footer note">
            <input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} className="input" />
          </Field>
        </div>

        {error && <p className="text-crimson-400 text-sm">{error}</p>}
        {saved && <p className="text-basil-400 text-sm">Saved.</p>}
        <button onClick={save} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.375rem;
          background: rgb(38 38 38);
          border: 1px solid rgb(64 64 64);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}
