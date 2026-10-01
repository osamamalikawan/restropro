'use client';
import { CustomersClient } from "./customers-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function CustomersPage() {
  return (
    <DesktopGuard >{(c) => (
      <CustomersClient />
    )}</DesktopGuard>
  );
}
