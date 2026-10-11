'use client';
import { DeliveryRidersClient } from "./riders-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function DeliveryRidersPage() {
  return (
    <DesktopGuard module="sales">{() => <DeliveryRidersClient />}</DesktopGuard>
  );
}
