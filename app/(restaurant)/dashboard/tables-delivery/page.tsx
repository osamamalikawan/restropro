import { redirect } from "next/navigation";

/** Tables & Delivery Areas moved into the Settings page as two panels (see
 *  settings-client.tsx) — this redirect just keeps old links/bookmarks working. */
export default function TablesDeliveryRedirect() {
  redirect("/dashboard/settings#tables");
}
