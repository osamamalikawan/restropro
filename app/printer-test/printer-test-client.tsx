"use client";
import { useState } from "react";

/** This page only works inside the Restro Pro POS desktop app (Tauri) — the printing itself
 *  happens locally on whichever machine has this page open, via window.__TAURI__.invoke, not
 *  through the server. Opening it in a plain browser tab will show the "not available" notice
 *  below instead of the test controls. */

type UsbDevice = {
  vendor_id: number;
  product_id: number;
  manufacturer: string | null;
  product: string | null;
  serial: string | null;
};

function hasTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI__;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as any).__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("Tauri bridge not found on this page.");
  return tauri.core.invoke(cmd, args) as Promise<T>;
}

/** ESC @ (initialize) + a short label line + a few feeds + GS V 0 (full cut). Deliberately
 *  plain ASCII, no bold/size codes, so this test payload is as widely compatible as possible
 *  across different printer models while we're still validating connectivity. */
function buildTestPayload(label: string): number[] {
  const encoder = new TextEncoder();
  const text = encoder.encode(`Restro Pro POS\n${label}\n${new Date().toLocaleString()}\n\n\n`);
  return [0x1b, 0x40, ...Array.from(text), 0x1d, 0x56, 0x00];
}

export function PrinterTestClient() {
  const [tauriPresent] = useState(() => hasTauri());

  // LAN state
  const [ip, setIp] = useState("192.168.1.");
  const [port, setPort] = useState("9100");
  const [lanBusy, setLanBusy] = useState(false);
  const [lanStatus, setLanStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // USB state
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbStatus, setUsbStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function testLanConnection() {
    setLanBusy(true);
    setLanStatus(null);
    try {
      await invokeTauri("test_printer_connection", { ip, port: Number(port) });
      setLanStatus({ ok: true, message: `Reached ${ip}:${port}.` });
    } catch (e: any) {
      setLanStatus({ ok: false, message: String(e) });
    } finally {
      setLanBusy(false);
    }
  }
  async function printLan() {
    setLanBusy(true);
    setLanStatus(null);
    try {
      await invokeTauri("print_raw", { ip, port: Number(port), data: buildTestPayload("LAN test print") });
      setLanStatus({ ok: true, message: `Print job sent to ${ip}:${port}.` });
    } catch (e: any) {
      setLanStatus({ ok: false, message: String(e) });
    } finally {
      setLanBusy(false);
    }
  }

  async function refreshUsbDevices() {
    setUsbBusy(true);
    setUsbStatus(null);
    try {
      const found = await invokeTauri<UsbDevice[]>("list_usb_printers");
      setDevices(found);
      setSelectedIdx(0);
      setUsbStatus({ ok: true, message: `Found ${found.length} USB device(s).` });
    } catch (e: any) {
      setUsbStatus({ ok: false, message: String(e) });
    } finally {
      setUsbBusy(false);
    }
  }
  async function printUsb() {
    const device = devices[selectedIdx];
    if (!device) {
      setUsbStatus({ ok: false, message: "Refresh the device list and pick one first." });
      return;
    }
    setUsbBusy(true);
    setUsbStatus(null);
    try {
      await invokeTauri("print_raw_usb", {
        vendorId: device.vendor_id,
        productId: device.product_id,
        data: buildTestPayload("USB test print"),
      });
      setUsbStatus({ ok: true, message: "Print job sent." });
    } catch (e: any) {
      setUsbStatus({ ok: false, message: String(e) });
    } finally {
      setUsbBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold mb-1">Printer connectivity test</h1>
      <p className="text-sm text-ink-mid mb-6">
        Standalone hardware test — not part of Settings yet. Test a printer here first, then we wire the working
        option into real checkout printing.
      </p>

      {!tauriPresent && (
        <div className="rounded-lg border border-turmeric-500/40 bg-turmeric-500/10 px-4 py-3 text-sm text-turmeric-400 mb-6">
          This page isn't running inside the Restro Pro POS desktop app, so printing can't work here — you're viewing
          it in a plain browser tab. Open it from inside the installed POS app instead.
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface p-5 mb-5">
        <h2 className="font-display font-semibold text-base mb-1">LAN / network printer</h2>
        <p className="text-xs text-ink-mid mb-4">Find the printer's IP from its self-test page. Port is almost always 9100.</p>
        <div className="flex gap-2 mb-3">
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.1.50"
            className="flex-1 rounded-md bg-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chili-500"
          />
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="9100"
            className="w-24 rounded-md bg-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chili-500"
          />
        </div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={testLanConnection}
            disabled={!tauriPresent || lanBusy}
            className="px-4 py-2 rounded-lg border border-line bg-raised text-sm font-medium disabled:opacity-50"
          >
            {lanBusy ? "Testing…" : "Test connection"}
          </button>
          <button
            onClick={printLan}
            disabled={!tauriPresent || lanBusy}
            className="px-4 py-2 rounded-lg bg-chili-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {lanBusy ? "Printing…" : "Test print"}
          </button>
        </div>
        {lanStatus && (
          <p className={`text-xs ${lanStatus.ok ? "text-basil-400" : "text-crimson-400"}`}>{lanStatus.message}</p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display font-semibold text-base mb-1">USB printer</h2>
        <p className="text-xs text-ink-mid mb-4">
          The printer must already be bound to the generic WinUSB driver (via Zadig) — a one-time step per printer.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={refreshUsbDevices}
            disabled={!tauriPresent || usbBusy}
            className="px-4 py-2 rounded-lg border border-line bg-raised text-sm font-medium disabled:opacity-50"
          >
            {usbBusy ? "Scanning…" : "Refresh USB devices"}
          </button>
        </div>
        {devices.length > 0 && (
          <div className="flex gap-2 mb-3">
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="flex-1 rounded-md bg-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chili-500"
            >
              {devices.map((d, i) => (
                <option key={i} value={i}>
                  {(d.manufacturer ? d.manufacturer + " " : "") + (d.product ?? "Unknown device")} — {d.vendor_id
                    .toString(16)
                    .padStart(4, "0")}
                  :{d.product_id.toString(16).padStart(4, "0")}
                </option>
              ))}
            </select>
            <button
              onClick={printUsb}
              disabled={!tauriPresent || usbBusy}
              className="px-4 py-2 rounded-lg bg-chili-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {usbBusy ? "Printing…" : "Test print"}
            </button>
          </div>
        )}
        {usbStatus && (
          <p className={`text-xs ${usbStatus.ok ? "text-basil-400" : "text-crimson-400"}`}>{usbStatus.message}</p>
        )}
      </section>
    </main>
  );
}