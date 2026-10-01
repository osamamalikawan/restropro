'use client';
import { RestockClient } from "./restock-client";
import { Suspense } from "react";
import { DesktopGuard } from "@/components/desktop-guard";

export default function RestockPage() {
  return (
    <DesktopGuard roles={["admin", "manager", "inventory"]}>{(c) => (
      <Suspense><RestockClient /></Suspense>
    )}</DesktopGuard>
  );
}
