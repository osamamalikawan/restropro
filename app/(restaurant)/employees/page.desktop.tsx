'use client';
import { EmployeesClient } from "./employees-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function EmployeesPage() {
  return (
    <DesktopGuard module="employees">{(c) => (
      <EmployeesClient canManage={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
