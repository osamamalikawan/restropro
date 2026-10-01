'use client';
import { SupplierLedgerClient } from "./supplier-ledger-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function SupplierLedgerPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <SupplierLedgerClient />
    )}</DesktopGuard>
  );
}
