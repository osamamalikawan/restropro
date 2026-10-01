"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "./shell";
import { DesktopCtxProvider, loadDesktopContext, type DesktopCtx } from "@/lib/desktop/context";
import { DesktopSyncBar } from "@/components/desktop-sync-bar";

/** Desktop version of layout.tsx: same sidebar + top bar (DashboardShell), but the session comes
 *  from the device (Rust) instead of a server cookie, so it also works offline. */
export default function DesktopDashboardLayout({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<DesktopCtx | null>(null);

  useEffect(() => {
    loadDesktopContext()
      .then((c) => {
        if (!c) window.location.href = "/login/staff";
        else setCtx(c);
      })
      .catch(() => {
        window.location.href = "/login/staff";
      });
  }, []);

  if (!ctx) return null;

  return (
    <DesktopCtxProvider value={ctx}>
      <DashboardShell
        role={ctx.role}
        restaurantName={ctx.restaurantName}
        employeeName={ctx.employeeName}
        employeeId={ctx.employeeId}
        subStatus={ctx.subStatus}
        modulePerms={ctx.modulePerms}
        shiftLabel={ctx.shiftLabel}
      >
        <div className="px-4 pt-3 md:px-6">
          <DesktopSyncBar />
        </div>
        {children}
      </DashboardShell>
    </DesktopCtxProvider>
  );
}
