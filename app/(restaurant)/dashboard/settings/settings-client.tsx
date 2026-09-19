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

type PaymentMethod = { id: string; name: string };

/** Matches the prototype's view-settings + view-paymentMethods: the four original Settings
 *  panels plus a Payment Methods panel folded in here rather than its own page, since it's
 *  just one panel (list + add row) — see app/(restaurant)/dashboard/payment-methods/page.tsx,
 *  which now only redirects here. Each panel still POSTs independently. */
export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [restName, setRestName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [newMethod, setNewMethod] = useState("");
  const [methodError, setMethodError] = useState("");

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
      const methodsRes = await fetch("/api/payment-methods");
      const methodsData = await methodsRes.json();
      if (methodsRes.ok) setMethods(methodsData.methods ?? []);
    })();
  }, []);

  async function loadMethods() {
    const res = await fetch("/api/payment-methods");
    const data = await res.json();
    if (res.ok) setMethods(data.methods ?? []);
  }

  async function addMethod() {
    const name = newMethod.trim();
    if (!name) {
      setMethodError("Enter a payment method name");
      return;
    }
    setMethodError("");
    const res = await fetch("/api/payment-methods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMethodError(data.error);
      return;
    }
    setNewMethod("");
    loadMethods();
  }

  async function removeMethod(m: PaymentMethod) {
    setMethodError("");
    const res = await fetch("/api/payment-methods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id: m.id } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMethodError(data.error);
      return;
    }
    setMethods((prev) => prev.filter((x) => x.id !== m.id));
  }

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

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading || !s) {
    return (
      <main className="p-6 md:p-8">
        <p className="text-ink-faint text-sm">Loading settings…</p>
      </main>
    );
  }

  const SECTIONS = [
    { id: "profile", label: "Restaurant profile" },
    { id: "payment-methods", label: "Payment methods" },
    { id: "pos-tax", label: "POS & Tax" },
    { id: "printer", label: "Printer & receipt" },
    { id: "fbr", label: "FBR invoicing" },
  ];

  return (
    <main className="p-6 md:p-8">
      {/* Scroll nav — sticks to the top of the page as you scroll, jumps to each panel below */}
      <div className="sticky top-0 z-10 -mx-6 md:-mx-8 px-6 md:px-8 py-3 mb-6 bg-canvas/95 backdrop-blur border-b border-line-soft flex gap-2 overflow-x-auto">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => scrollToSection(sec.id)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-line text-ink-mid hover:text-ink-strong hover:border-chili-500 transition-colors"
          >
            {sec.label}
          </button>
        ))}
      </div>

      {msg && <p className={`text-sm mb-4 ${msg.error ? "text-crimson-400" : "text-basil-400"}`}>{msg.text}</p>}

      <div className="grid md:grid-cols-2 gap-6 items-stretch">
        {/* Restaurant profile */}
        <div id="profile" className="scroll-mt-20">
          <Panel
            title="Restaurant profile"
            subtitle="Shown on receipts and the staff login screen"
            footer={
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
            }
          >
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
          </Panel>
        </div>

        {/* Payment methods — one panel, so it lives here instead of its own page */}
        <div id="payment-methods" className="scroll-mt-20">
          <Panel title="Payment methods" subtitle="Options customers can split payment across">
            <div className="space-y-1.5 mb-3">
              {methods.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
                  <span>{m.name}</span>
                  <button onClick={() => removeMethod(m)} className="text-ink-faint hover:text-crimson-400 text-xs">
                    ✕
                  </button>
                </div>
              ))}
              {methods.length === 0 && <p className="text-xs text-ink-faint">No payment methods enabled — add one below.</p>}
            </div>
            {methodError && <p className="text-xs text-crimson-400 mb-2">{methodError}</p>}
            <div className="flex gap-2">
              <input
                value={newMethod}
                onChange={(e) => setNewMethod(e.target.value)}
                placeholder="e.g. UPaisa"
                className="flex-1 rounded-lg bg-raised border border-line px-3 py-2 text-sm"
              />
              <button
                onClick={addMethod}
                className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
          </Panel>
        </div>

        {/* POS, Tax & Invoicing controls */}
        <div id="pos-tax" className="scroll-mt-20">
          <Panel
            title="POS, Tax & Invoicing controls"
            subtitle="Everything the checkout popup shows or hides, set from here"
            footer={
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
            }
          >
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
          </Panel>
        </div>

        {/* Printer & receipt */}
        <div id="printer" className="scroll-mt-20">
          <Panel
            title="Printer & receipt"
            subtitle="80mm thermal receipt printer"
            badge="Connected"
            footer={
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
            }
          >
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
          </Panel>
        </div>

        {/* FBR Digital Invoicing — spans both columns, it's the densest panel */}
        <div id="fbr" className="scroll-mt-20 md:col-span-2">
          <Panel
            title="FBR Digital Invoicing"
            subtitle="Federal Board of Revenue e-invoicing — off by default"
            headerRight={<Switch on={s.fbr_enabled} onChange={(v) => set("fbr_enabled", v)} title="Enable FBR integration" />}
            footer={
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
            }
          >
            <p className="text-xs text-ink-faint mb-3.5">
              This is a stub: turning it on prints a formatted FBR invoice number on receipts. It does not submit real
              invoices to FBR — that requires live PRAL/FBR API credentials.
            </p>
            <div className="grid md:grid-cols-4 gap-3">
              <Field label="NTN">
                <input value={s.fbr_ntn ?? ""} onChange={(e) => set("fbr_ntn", e.target.value)} placeholder="0000000-0" className="input" />
              </Field>
              <Field label="STRN">
                <input value={s.fbr_strn ?? ""} onChange={(e) => set("fbr_strn", e.target.value)} placeholder="00-00-0000-000-00" className="input" />
              </Field>
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
          </Panel>
        </div>
      </div>

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
  badge,
  headerRight,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">{title}</h3>
          <div className="text-xs text-ink-faint mt-0.5">{subtitle}</div>
        </div>
        {badge && <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-basil-500/20 text-basil-400 shrink-0">{badge}</span>}
        {headerRight}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="pt-3.5">{footer}</div>}
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
