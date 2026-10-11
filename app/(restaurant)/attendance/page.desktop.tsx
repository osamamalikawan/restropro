'use client';
import { AttendanceClient } from "./attendance-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function AttendancePage() {
  return (
    <DesktopGuard module="employees">{(c) => <AttendanceClient canMark={c.isAdminOrManager} />}</DesktopGuard>
  );
}
