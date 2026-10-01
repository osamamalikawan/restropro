'use client';
import { TablesDeliveryClient } from "./tables-delivery-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function TablesDeliveryPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <TablesDeliveryClient />
    )}</DesktopGuard>
  );
}
