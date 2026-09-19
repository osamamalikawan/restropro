import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { RestockClient } from "./restock-client";

export default async function RestockPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!["admin", "manager", "inventory"].includes(session.role)) redirect("/dashboard");

  return (
    <Suspense>
      <RestockClient />
    </Suspense>
  );
}