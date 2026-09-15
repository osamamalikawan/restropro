"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    <header className="topbar flex items-center justify-between shrink-0">
      <div>
        <div className="restaurant-title">{restaurantName}</div>
        {subStatus === "grace" && <span className="text-xs text-turmeric-400">Subscription in grace period — please renew</span>}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-neutral-500 font-mono hidden sm:inline">{time}</span>
        <div className="user-chip">
          <div className="user-avatar">{employeeName.split(" ").map((name) => name[0]).slice(0, 2).join("")}</div>
          <div>
            <div className="text-sm font-medium leading-none">{employeeName}</div>
            <div className="text-[10px] text-neutral-500 capitalize mt-1">{role}</div>
          </div>
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="logout-button text-xs disabled:opacity-50"
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      </div>
    </header>
  );
}
