"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { isOrderSoundOn, isOwnOrder, playOrderChime, primeOrderSound } from "@/lib/order-alert";
import { fmtMoney } from "@/lib/format";

type NewSale = { id: string; order_no: number | string; display_id: string | null; total: number; order_type: string; cashier: string | null };
type Toast = { key: string; title: string; body: string };

const POLL_MS = 8000;
const TOAST_MS = 15000;
const TYPE_LABEL: Record<string, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery" };

/** Announces orders placed on OTHER devices, on whatever page is open: a chime (if sound is on) and a banner that blinks
 *  and opens the Ticket Rail when clicked; a desktop notification too when the browser tab is in the background and
 *  notifications are allowed. Polls /api/sales/new every few seconds. The Ticket Rail page already blinks + chimes for
 *  new tickets itself, so there only the banner is added. Renders nothing until an order arrives. */
export function NewOrderAlert() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [canAsk, setCanAsk] = useState(false);

  useEffect(() => {
    let stopped = false;
    let since: string | null = null;
    try {
      since = sessionStorage.getItem("rp_alert_since");
    } catch {
      /* ignore */
    }
    setCanAsk(typeof Notification !== "undefined" && Notification.permission === "default");

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/sales/new${since ? `?since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
        if (res.status === 403) {
          stopped = true; // this role can't see orders: nothing to announce
          return;
        }
        if (!res.ok) return;
        const d = (await res.json()) as { now: string; sales: NewSale[] };
        since = d.now;
        try {
          sessionStorage.setItem("rp_alert_since", d.now);
        } catch {
          /* ignore */
        }
        const fresh = d.sales.filter((s) => !isOwnOrder(s)); // not the order this device just placed
        if (fresh.length === 0) return;

        if (isOrderSoundOn() && !pathRef.current.startsWith("/ticket-rail")) playOrderChime();
        const items: Toast[] = fresh.map((s) => ({
          key: s.id,
          title: `New order #${s.display_id ?? s.order_no}`,
          body: `${TYPE_LABEL[s.order_type] ?? s.order_type} · ${fmtMoney(s.total)}${s.cashier ? ` · ${s.cashier}` : ""}`,
        }));
        setToasts((prev) => [...prev, ...items].slice(-4));
        for (const t of items) setTimeout(() => setToasts((prev) => prev.filter((x) => x.key !== t.key)), TOAST_MS);

        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          const first = items[0];
          new Notification(items.length > 1 ? `${items.length} new orders` : first.title, { body: items.length > 1 ? "Open the Ticket Rail" : first.body, tag: "rp-new-order" });
        }
      } catch {
        /* offline: try again next time */
      }
    }

    // browsers only allow sound after the person has touched the page once
    const unlock = () => primeOrderSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.key} className="pointer-events-auto flex animate-pulse items-start gap-3 rounded-xl border-2 border-chili-500 bg-surface p-3 shadow-2xl">
          <button
            onClick={() => {
              setToasts((prev) => prev.filter((x) => x.key !== t.key));
              router.push("/ticket-rail");
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-chili-500 text-white">
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink-strong">{t.title}</span>
              <span className="block truncate text-xs text-ink-mid">{t.body}</span>
              <span className="mt-1 block text-[11px] font-semibold text-chili-500">Open Ticket Rail →</span>
              {canAsk && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    Notification.requestPermission().then(() => setCanAsk(false));
                  }}
                  className="mt-1 block text-[11px] font-semibold text-ink-mid underline"
                >
                  Also show desktop notifications
                </span>
              )}
            </span>
          </button>
          <button onClick={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))} className="text-ink-faint hover:text-ink-strong" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
