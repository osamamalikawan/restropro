'use client';
import { UnpaidOrdersClient } from "./unpaid-orders-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function UnpaidOrdersPage() {
  return (
    <DesktopGuard module="sales">{(c) => (
      <UnpaidOrdersClient />
    )}</DesktopGuard>
  );
}
