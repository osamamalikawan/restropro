'use client';
import { ProductsClient } from "./products-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function ProductsPage() {
  return (
    <DesktopGuard module="products">{(c) => (
      <ProductsClient canEdit={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
