'use client';
import { ShiftRecordsClient } from "./shift-records-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function ShiftRecordsPage() {
  return (
    <DesktopGuard module="employees">{() => <ShiftRecordsClient />}</DesktopGuard>
  );
}
