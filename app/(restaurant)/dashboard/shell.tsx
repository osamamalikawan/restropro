"use client";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Role } from "./nav-config";

export function DashboardShell({
  role,
  restaurantName,
  employeeName,
  employeeId,
  subStatus,
  children,
}: {
  role: Role;
  restaurantName: string;
  employeeName: string;
  employeeId: string;
  subStatus: string;
  children: React.ReactNode;
}) {
  // One boolean, same as the prototype's toggleSidebar(): false = the natural desktop
  // state (sidebar visible) which also happens to be the natural mobile state (drawer
  // closed); true flips both at once — collapses the sidebar on desktop, opens the
  // off-canvas drawer on mobile. See sidebar.tsx for how each breakpoint reads it.
  const [navToggled, setNavToggled] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-ink-strong flex">
      <Sidebar
        role={role}
        restaurantName={restaurantName}
        navToggled={navToggled}
        onNavigate={() => setNavToggled(false)}
      />
      {/* Mobile-only backdrop so tapping outside the open drawer closes it */}
      {navToggled && (
        <button
          aria-label="Close sidebar"
          onClick={() => setNavToggled(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/50"
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          employeeName={employeeName}
          employeeId={employeeId}
          role={role}
          subStatus={subStatus}
          onToggleSidebar={() => setNavToggled((v) => !v)}
        />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
