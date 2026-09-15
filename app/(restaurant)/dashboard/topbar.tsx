"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar({
  restaurantName,
  employeeName,
  role,
  subStatus,
}: {
  restaurantName: string;
  employeeName: string;
  role: string;
  subStatus: string;
}) {
  const [time, setTime] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/staff/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-line bg-canvas flex items-center justify-between px-6 shrink-0">
      <div>
        <div className="font-display font-semibold text-ink-strong">{restaurantName}</div>
        {subStatus === "grace" && <span className="text-xs text-turmeric-400">Subscription in grace period — please renew</span>}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-ink-faint font-mono hidden sm:inline">{time}</span>
        <ThemeToggle />
        <div className="text-right">
          <div className="text-sm font-medium text-ink-strong">{employeeName}</div>
          <div className="text-xs text-ink-faint capitalize">{role}</div>
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="text-xs text-ink-faint hover:text-crimson-400 border border-line rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      </div>
    </header>
  );
}
