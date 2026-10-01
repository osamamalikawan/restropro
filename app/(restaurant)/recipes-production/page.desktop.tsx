'use client';
import { RecipesProductionClient } from "./recipes-production-client";
import { Suspense } from "react";
import { DesktopGuard } from "@/components/desktop-guard";

export default function RecipesProductionPage() {
  return (
    <DesktopGuard module="recipes">{(c) => (
      <Suspense><RecipesProductionClient /></Suspense>
    )}</DesktopGuard>
  );
}
