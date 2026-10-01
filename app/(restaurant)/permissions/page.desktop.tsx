'use client';
import { PermissionsClient } from "./permissions-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function PermissionsPage() {
  return (
    <DesktopGuard module="admin">{(c) => (
      <PermissionsClient canManageUsers={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
