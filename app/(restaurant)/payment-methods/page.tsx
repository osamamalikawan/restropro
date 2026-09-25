import { redirect } from "next/navigation";

/** Payment Methods is one panel, folded into the Settings page rather than its own route
 *  (see settings-client.tsx) — this redirect just keeps old links/bookmarks working. */
export default function PaymentMethodsRedirect() {
  redirect("/dashboard/settings#payment-methods");
}
