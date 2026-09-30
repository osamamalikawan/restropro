// POS receipt / kitchen-slip builders (plain ASCII ESC/POS) + the glue that sends them to the
// right printer role. Printer connections themselves are configured in Printer settings and
// stored per machine — see app/(restaurant)/printer-settings/printers.ts.

// NOTE: deliberately self-contained (same localStorage keys + Tauri commands as
// app/(restaurant)/printer-settings/printers.ts). The offline desktop build moves the whole
// app/(restaurant) folder away, so the POS must not import from it.
type PrinterConfig =
  | { mode: "none" }
  | { mode: "usb"; printerName: string }
  | { mode: "lan"; ip: string; port: number };

const hasTauri = () => typeof window !== "undefined" && !!(window as any).__TAURI__;

function loadPrinterConfig(role: "receipt" | "kitchen"): PrinterConfig {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`restropro.printer.${role}`) || "null");
    if (parsed?.mode === "usb" && typeof parsed.printerName === "string") return parsed;
    if (parsed?.mode === "lan" && typeof parsed.ip === "string") return { mode: "lan", ip: parsed.ip, port: Number(parsed.port) || 9100 };
  } catch {}
  return { mode: "none" };
}

async function printToRole(role: "receipt" | "kitchen", data: number[]): Promise<void> {
  const invoke = (window as any).__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Tauri bridge not found — open this in the desktop app.");
  const c = loadPrinterConfig(role);
  if (c.mode === "usb") await invoke("print_raw_windows", { printerName: c.printerName, data });
  else if (c.mode === "lan") await invoke("print_raw", { ip: c.ip, port: c.port, data });
  else throw new Error(`no ${role === "kitchen" ? "kitchen" : "receipt"} printer is set up (Printer settings)`);
}


export type SaveAction = "save" | "kitchen" | "invoice";

export type SaleSnapshot = {
  restaurantName: string;
  address: string;
  phone: string;
  header: string;
  footer: string;
  paper: string; // settings.paper_width, e.g. "80" or "58mm"
  cashier: string;
  orderTypeLabel: string; // e.g. "Dine in · Table 4", "Takeaway"
  customerName: string;
  customerPhone: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  delivery: number;
  taxLabel: string; // e.g. "Cash tax (17%)"
  tax: number;
  fee: number; // FBR invoicing fee (0 when FBR is off)
  total: number;
  payments: { method: string; amount: number }[];
};

const ESC = 0x1b;
const GS = 0x1d;
const money = (n: number) => n.toLocaleString("en-US");
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "?"); // thermal code pages choke on Unicode (₨, Urdu…)

class Buf {
  bytes: number[] = [ESC, 0x40]; // initialise
  constructor(public cols: number) {}
  text(s: string) {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") {
    return this.text(s).raw(0x0a);
  }
  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  align(a: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  size(big: boolean) {
    return this.raw(GS, 0x21, big ? 0x11 : 0x00);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.cols));
  }
  row(left: string, right: string) {
    const l = ascii(left);
    const r = ascii(right);
    const space = Math.max(1, this.cols - l.length - r.length);
    return this.line(l.slice(0, Math.max(0, this.cols - r.length - 1)) + " ".repeat(space) + r);
  }
  cut() {
    return this.raw(0x0a, 0x0a, 0x0a, GS, 0x56, 0x00);
  }
}

const colsFor = (paper: string) => (/58/.test(paper) ? 32 : 48);

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of ascii(s).split(" ")) {
    if ((cur + " " + word).trim().length > width) {
      if (cur) out.push(cur);
      cur = word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

export function buildKitchenSlip(s: SaleSnapshot, orderNo: string | number): number[] {
  const b = new Buf(colsFor(s.paper));
  b.align("center").bold(true).size(true).line("KITCHEN").size(false).bold(false);
  b.bold(true).line(`Order #${orderNo}`).bold(false);
  b.line(s.orderTypeLabel).line(new Date().toLocaleString());
  b.align("left").rule();
  b.bold(true).size(true);
  for (const it of s.items) for (const l of wrap(`${it.qty} x ${it.name}`, Math.floor(b.cols / 2))) b.line(l);
  b.size(false).bold(false).rule();
  return b.cut().bytes;
}

export function buildInvoice(s: SaleSnapshot, orderNo: string | number): number[] {
  const b = new Buf(colsFor(s.paper));
  b.align("center").bold(true).size(true);
  for (const l of wrap(s.restaurantName, Math.floor(b.cols / 2))) b.line(l);
  b.size(false).bold(false);
  if (s.address) b.line(s.address);
  if (s.phone) b.line(s.phone);
  if (s.header) b.line(s.header);
  b.align("left").rule();
  b.row(`Order #${orderNo}`, new Date().toLocaleString());
  b.line(s.orderTypeLabel).line(`Cashier: ${s.cashier}`);
  if (s.customerName || s.customerPhone) b.line(`Customer: ${[s.customerName, s.customerPhone].filter(Boolean).join(" ")}`);
  b.rule();
  for (const it of s.items) {
    const lines = wrap(`${it.qty} x ${it.name}`, b.cols - 12);
    lines.forEach((l, i) => (i === lines.length - 1 ? b.row(l, money(it.price * it.qty)) : b.line(l)));
  }
  b.rule();
  b.row("Subtotal", money(s.subtotal));
  if (s.delivery > 0) b.row("Delivery", money(s.delivery));
  if (s.tax > 0) b.row(s.taxLabel, money(s.tax));
  if (s.fee > 0) b.row("FBR invoicing fee", money(s.fee));
  b.rule();
  b.bold(true).size(true).row("TOTAL", `Rs ${money(s.total)}`).size(false).bold(false);
  const paid = s.payments.reduce((t, p) => t + p.amount, 0);
  for (const p of s.payments) b.row(p.method, money(p.amount));
  if (paid < s.total) b.bold(true).row("Balance due", money(s.total - paid)).bold(false);
  else if (paid > s.total) b.row("Change", money(paid - s.total));
  if (s.footer) b.rule().align("center").line(s.footer);
  return b.cut().bytes;
}

/** Sends the slip/invoice to the matching printer role. Throws a readable Error when it can't. */
export async function printSale(action: Exclude<SaveAction, "save">, s: SaleSnapshot, orderNo: string | number) {
  if (!hasTauri()) throw new Error("printing works in the desktop app only");
  if (action === "kitchen") await printToRole("kitchen", buildKitchenSlip(s, orderNo));
  else await printToRole("receipt", buildInvoice(s, orderNo));
}
