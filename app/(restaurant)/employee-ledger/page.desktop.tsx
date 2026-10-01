'use client';
import { EmployeeLedgerClient } from "./employee-ledger-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function EmployeeLedgerPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <EmployeeLedgerClient />
    )}</DesktopGuard>
  );
}
