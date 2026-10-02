"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/app/(restaurant)/shell";
import { DesktopCtxProvider, loadDesktopContext, type DesktopCtx } from "@/lib/desktop/context";
import { DesktopSyncBar } from "@/components/desktop-sync-bar";

/** The desktop counterpart of the server-side shell setup in each web page.tsx: same sidebar +
 *  top bar (DashboardShell), but the signed-in cashier, permissions and shift come from the device
 *  (Rust), not a cookie, so it works offline. Used by every back-office page (via
 *  app/(restaurant)/layout.desktop.tsx) and by the POS, so all of them look identical to the web
 *  app. `syncBar={false}` for the POS, which shows its own sync strip inside its menu pane. */
export function DesktopShell({ children, syncBar = true }: { children: React.ReactNode; syncBar?: boolean }) {
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
        {syncBar && (
          <div className="px-4 pt-3 md:px-6">
            <DesktopSyncBar />
          </div>
        )}
        {children}
      </DashboardShell>
    </DesktopCtxProvider>
  );
}
