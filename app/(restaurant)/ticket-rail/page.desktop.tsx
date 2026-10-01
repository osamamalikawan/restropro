'use client';
import { TicketRailClient } from "./ticket-rail-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function TicketRailPage() {
  return (
    <DesktopGuard module="pos">{(c) => (
      <TicketRailClient restaurantId={c.restaurantId} canCancel={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
