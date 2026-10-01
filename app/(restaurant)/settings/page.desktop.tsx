'use client';
import { SettingsClient } from "./settings-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function SettingsPage() {
  return (
    <DesktopGuard anyModule={["settings", "tables"]}>{(c) => (
      <SettingsClient canSettings={c.can("settings")} canTables={c.can("tables")} canManageTables={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
