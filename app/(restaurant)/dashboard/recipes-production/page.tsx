import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { canAccess } from "../nav-config";
import { ComingSoon } from "../coming-soon";

export default async function RecipesProductionPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!canAccess(session.role, "recipes")) redirect("/dashboard");

  return (
    <ComingSoon
      title="Recipes & Production"
      note="The recipe engine and self-made item production log isn't wired up yet — it'll live here, matching the prototype's three tabs."
    />
  );
}
