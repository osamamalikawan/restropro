'use client';
import { InventoryClient } from "./inventory-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function InventoryPage() {
  return (
    <DesktopGuard roles={["admin", "manager", "inventory"]}>{(c) => (
      <InventoryClient />
    )}</DesktopGuard>
  );
}
