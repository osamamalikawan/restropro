'use client';
import { SuppliersClient } from "./suppliers-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function SuppliersPage() {
  return (
    <DesktopGuard roles={["admin", "manager", "inventory"]}>{(c) => (
      <SuppliersClient />
    )}</DesktopGuard>
  );
}
