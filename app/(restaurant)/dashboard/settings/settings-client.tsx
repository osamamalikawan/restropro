"use client";
import { useEffect, useState } from "react";

type Settings = {
  service_charge_rate: number;
  cash_tax_rate: number;
  card_tax_rate: number;
  pos_show_kitchen_print: boolean;
  pos_show_print_invoice: boolean;
  printer_name: string | null;
  paper_width: string;
  connection: string;
  auto_print: boolean;
  receipt_header: string | null;
  receipt_footer: string | null;
  fbr_enabled: boolean;
  fbr_ntn: string | null;
  fbr_strn: string | null;
  fbr_pos_id: string | null;
  fbr_api_token: string | null;
  fbr_environment: string;
  fbr_fee: number;
};

/** Matches the prototype's view-settings 1:1: same four panels, same fields, same
 *  independent "Save …" button per panel (each POSTs only that panel's fields — see
 *  app/api/settings/route.ts's partial-update behaviour). */
export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [restName, setRestName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        if (data.restaurant) {
          setRestName(data.restaurant.name ?? "");
          setAddress(data.restaurant.address ?? "");
          setPhone(data.restaurant.phone ?? "");
        }
        setS(data.settings);
      }
      setLoading(false);
    })();
  }, []);

  async function save(body: Record<string, unknown>, okMessage: string) {
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ text: data.error || "Could not save", error: true });
      return;
    }
    setMsg({ text: okMessage });
    setTimeout(() => setMsg(null), 2500);
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (loading || !s) {
    return (
      <main className="p-6 md:p-8">
        <p className="text-ink-faint text-sm">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="p-6 md:p-8 space-y-6">
      {msg && <p className={`text-sm ${msg.error ? "text-crimson-400" : "text-basil-400"}`}>{msg.text}</p>}

      {/* Restaurant profile */}
      <Panel title="Restaurant profile" subtitle="Shown on receipts and the staff login screen" maxW="640px">
        <Field label="Restaurant name">
          <input value={restName} onChange={(e) => setRestName(e.target.value)} className="input" />
        </Field>
        <Field label="Default dine-in service charge (%)">
          <input
            type="number"
            value={s.service_charge_rate}
            onChange={(e) => set("service_charge_rate", Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Address">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
        <SaveButton
          onClick={() =>
            save(
              { restaurantName: restName, address, phone, serviceChargeRate: s.service_charge_rate },
              "Settings saved"
            )
          }
        >
          Save profile
        </SaveButton>
      </Panel>

      {/* POS, Tax & Invoicing controls */}
      <Panel title="POS, Tax & Invoicing controls" subtitle="Everything the checkout popup shows or hides, set from here" maxW="640px">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cash tax rate (%)">
            <input type="number" value={s.cash_tax_rate} onChange={(e) => set("cash_tax_rate", Number(e.target.value))} className="input" />
          </Field>
          <Field label="Card tax rate (%)">
            <input type="number" value={s.card_tax_rate} onChange={(e) => set("card_tax_rate", Number(e.target.value))} className="input" />
          </Field>
        </div>
        <p className="text-xs text-ink-faint -mt-1 mb-3.5">
          Checkout shows only the tax that applies to the payment method currently selected.
        </p>
        <ToggleRow label='Show "Kitchen Print" button' on={s.pos_show_kitchen_print} onChange={(v) => set("pos_show_kitchen_print", v)} />
        <ToggleRow label='Show "Print Invoice" button' on={s.pos_show_print_invoice} onChange={(v) => set("pos_show_print_invoice", v)} />
        <SaveButton
          onClick={() =>
            save(
              {
                cashTaxRate: s.cash_tax_rate,
                cardTaxRate: s.card_tax_rate,
                posShowKitchenPrint: s.pos_show_kitchen_print,
                posShowPrintInvoice: s.pos_show_print_invoice,
              },
              "POS controls saved"
            )
          }
        >
          Save POS controls
        </SaveButton>
      </Panel>

      {/* Printer & receipt */}
      <Panel title="Printer & receipt" subtitle="80mm thermal receipt printer" maxW="640px" badge="Connected">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Printer name">
            <input value={s.printer_name ?? ""} onChange={(e) => set("printer_name", e.target.value)} className="input" />
          </Field>
          <Field label="Paper width">
            <select value={s.paper_width} onChange={(e) => set("paper_width", e.target.value)} className="input">
              <option>80mm</option>
              <option>58mm</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Connection">
            <select value={s.connection} onChange={(e) => set("connection", e.target.value)} className="input">
              <option>USB</option>
              <option>Network (IP)</option>
              <option>Bluetooth</option>
            </select>
          </Field>
          <div className="mb-3">
            <ToggleRow label="Auto-print on checkout" on={s.auto_print} onChange={(v) => set("auto_print", v)} noMargin />
          </div>
        </div>
        <Field label="Receipt header note">
          <input value={s.receipt_header ?? ""} onChange={(e) => set("receipt_header", e.target.value)} className="input" />
        </Field>
        <Field label="Receipt footer note">
          <input value={s.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value)} className="input" />
        </Field>
        <div className="flex gap-2.5">
          <SaveButton
            onClick={() =>
              save(
                {
                  printerName: s.printer_name,
                  paperWidth: s.paper_width,
                  connection: s.connection,
                  autoPrint: s.auto_print,
                  receiptHeader: s.receipt_header,
                  receiptFooter: s.receipt_footer,
                },
                "Printer settings saved"
              )
            }
          >
            Save printer settings
          </SaveButton>
          <button
            onClick={() => setMsg({ text: "Test receipt sent to the printer (stub — no real printer wired up yet)." })}
            className="rounded-md border border-line text-ink-mid hover:text-ink-strong hover:border-chili-500 text-sm font-semibold px-4 py-2 transition-colors"
          >
            Test print
          </button>
        </div>
      </Panel>

      {/* FBR Digital Invoicing */}
      <Panel
        title="FBR Digital Invoicing"
        subtitle="Federal Board of Revenue e-invoicing — off by default"
        maxW="640px"
        headerRight={<Switch on={s.fbr_enabled} onChange={(v) => set("fbr_enabled", v)} title="Enable FBR integration" />}
      >
        <p className="text-xs text-ink-faint mb-3.5">
          This is a stub: turning it on prints a formatted FBR invoice number on receipts. It does not submit real
          invoices to FBR — that requires live PRAL/FBR API credentials.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NTN">
            <input value={s.fbr_ntn ?? ""} onChange={(e) => set("fbr_ntn", e.target.value)} placeholder="0000000-0" className="input" />
          </Field>
          <Field label="STRN">
            <input value={s.fbr_strn ?? ""} onChange={(e) => set("fbr_strn", e.target.value)} placeholder="00-00-0000-000-00" className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="POS Registration No.">
            <input value={s.fbr_pos_id ?? ""} onChange={(e) => set("fbr_pos_id", e.target.value)} placeholder="Issued by FBR portal" className="input" />
          </Field>
          <Field label="Environment">
            <select value={s.fbr_environment} onChange={(e) => set("fbr_environment", e.target.value)} className="input">
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="API Token">
            <input
              type="password"
              value={s.fbr_api_token ?? ""}
              onChange={(e) => set("fbr_api_token", e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </Field>
          <Field label="Invoicing fee added to bill (Rs)">
            <input type="number" value={s.fbr_fee} onChange={(e) => set("fbr_fee", Number(e.target.value))} className="input" />
          </Field>
        </div>
        <SaveButton
          onClick={() =>
            save(
              {
                fbrEnabled: s.fbr_enabled,
                fbrNtn: s.fbr_ntn,
                fbrStrn: s.fbr_strn,
                fbrPosId: s.fbr_pos_id,
                fbrApiToken: s.fbr_api_token,
                fbrEnvironment: s.fbr_environment,
                fbrFee: s.fbr_fee,
              },
              s.fbr_enabled ? "FBR integration enabled (sandbox stub)" : "FBR integration disabled"
            )
          }
        >
          Save FBR settings
        </SaveButton>
      </Panel>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          background: rgb(var(--bg-raised));
          border: 1px solid rgb(var(--line));
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          margin-top: 0.25rem;
          color: rgb(var(--ink-strong));
        }
      `}</style>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  maxW,
  badge,
  headerRight,
  children,
}: {
  title: string;
  subtitle: string;
  maxW: string;
  badge?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6" style={{ maxWidth: maxW }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">{title}</h3>
          <div className="text-xs text-ink-faint mt-0.5">{subtitle}</div>
        </div>
        {badge && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-basil-500/20 text-basil-400 shrink-0">{badge}</span>}
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3.5">
      <span className="text-xs font-semibold text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function Switch({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${on ? "bg-chili-500 justify-end" : "bg-raised border border-line justify-start"}`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow" />
    </button>
  );
}

function ToggleRow({ label, on, onChange, noMargin }: { label: string; on: boolean; onChange: (v: boolean) => void; noMargin?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${noMargin ? "" : "mb-3.5"}`}>
      <span className="text-sm text-ink-mid">{label}</span>
      <Switch on={on} onChange={onChange} />
    </div>
  );
}

function SaveButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2 transition-colors">
      {children}
    </button>
  );
}
