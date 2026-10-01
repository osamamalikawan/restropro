'use client';
import { UsersClient } from "./users-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function UsersPage() {
  return (
    <DesktopGuard module="employees">{(c) => (
      <UsersClient canManage={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
