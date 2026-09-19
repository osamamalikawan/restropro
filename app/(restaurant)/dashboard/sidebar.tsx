"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_GROUPS, canAccess, type Role } from "./nav-config";

/**
 * Matches the prototype's #sidebar 1:1: a "RP" brand mark + restaurant name/"Ops Console"
 * subtitle, four permission-filtered nav groups, and a foot with the sign-out control
 * (prototype: "Clock out & switch user" — logs the PIN session out and returns to the
 * owner-login step, matching logout()/employeeLogout() in the prototype's auth.js).
 *
 * `navToggled` mirrors the prototype's single toggle acting two different ways per
 * breakpoint: on desktop it collapses this sidebar to width 0 (`.sidebar-hidden`); on mobile
 * it's what makes the off-canvas drawer slide in (`#sidebar.open`). See DashboardShell.
 */
export function Sidebar({
  role,
  restaurantName,
  navToggled,
  onNavigate,
}: {
  role: Role;
  restaurantName: string;
  navToggled: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/staff/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={`bg-surface border-r border-line flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-out
        md:static md:transform-none md:transition-[width,padding,opacity]
        ${navToggled ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
        ${navToggled ? "md:w-0 md:opacity-0 md:pointer-events-none md:overflow-hidden md:border-0 md:p-0" : "md:w-64 md:opacity-100"}`}
    >
      <div className="flex items-center gap-3 px-5 py-5 border-b border-line-soft shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-chili-400 to-chili-600 flex items-center justify-center shrink-0">
          <span className="font-display italic font-bold text-white text-sm">RP</span>
        </div>
        <div className="min-w-0">
          <div className="font-display font-semibold text-ink-strong text-sm truncate">{restaurantName}</div>
          <div className="text-[10px] text-ink-faint uppercase tracking-wide">Ops Console</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((i) => canAccess(role, i.perm));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-2.5 mb-2">
                {group.label}
              </div>
              {visibleItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm mb-0.5 transition-colors ${
                      active
                        ? "bg-chili-500/15 text-chili-400 font-semibold"
                        : "text-ink-mid hover:bg-hover hover:text-ink-strong"
                    }`}
                  >
                    <Icon size={16} className={active ? "opacity-100" : "opacity-70"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line-soft shrink-0">
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full text-center text-xs font-semibold text-ink-faint hover:text-crimson-400 border border-line rounded-lg py-2.5 transition-colors disabled:opacity-50"
        >
          {loggingOut ? "Signing out…" : "Clock out & switch user"}
        </button>
      </div>
    </aside>
  );
}
