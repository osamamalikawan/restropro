import {
  LayoutDashboard,
  ShoppingCart,
  Ticket,
  TrendingUp,
  Clock,
  Users,
  Box,
  UtensilsCrossed,
  Layers,
  RefreshCw,
  ClipboardList,
  Truck,
  FileText,
  User,
  DollarSign,
  CreditCard,
  MapPin,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "manager" | "cashier" | "inventory";

/** Sidebar nav modules, ordered/grouped exactly like the prototype's #sidebar. `perm` is the
 *  permission-module key that gates visibility (see ROLE_MODULES below) — matches the
 *  prototype's `data-perm` attribute 1:1, including the two views that intentionally reuse
 *  another module's permission (Ticket Rail rides on "pos", Unpaid Orders and Payment
 *  Methods ride on "sales" and "settings" respectively). */
export type NavItem = { href: string; label: string; icon: LucideIcon; perm: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
      { href: "/pos", label: "Point of Sale", icon: ShoppingCart, perm: "pos" },
      { href: "/dashboard/ticket-rail", label: "Ticket Rail", icon: Ticket, perm: "pos" },
      { href: "/dashboard/sales", label: "Sales", icon: TrendingUp, perm: "sales" },
      { href: "/dashboard/unpaid-orders", label: "Unpaid Orders", icon: Clock, perm: "sales" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users, perm: "customers" },
      { href: "/dashboard/products", label: "Products", icon: Box, perm: "products" },
      { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed, perm: "menu" },
      { href: "/dashboard/inventory", label: "Inventory", icon: Layers, perm: "inventory" },
      { href: "/dashboard/restock", label: "Restock", icon: RefreshCw, perm: "restock" },
      { href: "/dashboard/recipes-production", label: "Recipes & Production", icon: ClipboardList, perm: "recipes" },
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck, perm: "suppliers" },
      { href: "/dashboard/supplier-ledger", label: "Supplier Ledger", icon: FileText, perm: "supplierLedger" },
      { href: "/dashboard/employees", label: "Employees", icon: User, perm: "employees" },
      { href: "/dashboard/employee-ledger", label: "Employee Ledger", icon: FileText, perm: "employeeLedger" },
      { href: "/dashboard/accounts", label: "Accounts", icon: DollarSign, perm: "accounts" },
      { href: "/dashboard/expenses", label: "Expenses", icon: CreditCard, perm: "expenses" },
    ],
  },
  // {
  //   label: "Configure",
  //   items: [
  //     { href: "/dashboard/tables-delivery", label: "Tables & Delivery", icon: MapPin, perm: "tables" },
  //     { href: "/dashboard/settings#payment-methods", label: "Payment Methods", icon: CreditCard, perm: "settings" },
  //   ],
  // },
  {
    label: "System",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings, perm: "settings" },
      { href: "/dashboard/permissions", label: "Users & Permissions", icon: ShieldCheck, perm: "admin" },
    ],
  },
];

/**
 * View access is now per-tenant and editable (Users & Permissions page) — see
 * lib/permissions.ts, which owns the defaults and the DB read/write. This file only keeps
 * the static bits (labels, icons, routes, titles) plus a small pure helper for checking a
 * resolved module-access map, since that's still needed in three places (Sidebar filtering,
 * page-level guards, and the topbar) and shouldn't be reimplemented three times.
 */
export function canAccess(role: string, modulePerms: Record<string, boolean> | undefined, perm: string): boolean {
  if (role === "admin") return true;
  return !!modulePerms?.[perm];
}

/** Per-page title + subtitle for the topbar, matching the prototype's RESTAURANT_VIEW_META
 *  (scripts/app.js) — keyed by the dashboard sub-path (matched by longest-prefix in
 *  getPageMeta below, so nested/profile routes still resolve to their parent section). */
export const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Live overview of today's service" },
  "/dashboard/ticket-rail": { title: "Ticket Rail", subtitle: "Kanban view of every active and held ticket" },
  "/dashboard/sales": { title: "Sales", subtitle: "Full order history across all channels" },
  "/dashboard/unpaid-orders": { title: "Unpaid Orders", subtitle: "Orders saved without full payment" },
  "/dashboard/customers": { title: "Customers", subtitle: "Every guest who has ordered with you" },
  "/dashboard/products": { title: "Products", subtitle: "Cost & selling price for every menu item — admin only" },
  "/dashboard/menu": { title: "Menu", subtitle: "Categories and product cards shown in POS" },
  "/dashboard/inventory": { title: "Inventory", subtitle: "Ingredients and packaging on hand" },
  "/dashboard/restock": { title: "Restock", subtitle: "Log purchases from suppliers and add to stock" },
  "/dashboard/recipes-production": { title: "Recipes & Production", subtitle: "Recipe engine and self-made item production" },
  "/dashboard/suppliers": { title: "Suppliers", subtitle: "Vendors supplying stock and ingredients" },
  "/dashboard/supplier-ledger": { title: "Supplier Ledger", subtitle: "Payments made to suppliers" },
  "/dashboard/employees": { title: "Employees", subtitle: "Staff directory, roles & shift assignment" },
  "/dashboard/employee-ledger": { title: "Employee Ledger", subtitle: "Salary, advance & bonus payments" },
  "/dashboard/accounts": { title: "Accounts", subtitle: "Income & expense ledger" },
  "/dashboard/expenses": { title: "Expenses", subtitle: "Regular and recurring restaurant expenses" },
  "/dashboard/tables-delivery": { title: "Tables & Delivery", subtitle: "Dine-in tables and delivery coverage areas" },
  "/dashboard/settings": { title: "Settings", subtitle: "Restaurant profile & printer configuration" },
  "/dashboard/permissions": { title: "Users & Permissions", subtitle: "Roles, permission matrix & shift timing" },
};

/** Longest-prefix match so a nested/profile route (e.g. /dashboard/customers/[id]) still
 *  picks up its section's title instead of falling back to the bare Dashboard default. */
export function getPageMeta(pathname: string): { title: string; subtitle: string } {
  let best: { title: string; subtitle: string } | null = null;
  let bestLen = -1;
  for (const [prefix, meta] of Object.entries(VIEW_META)) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > bestLen) {
      best = meta;
      bestLen = prefix.length;
    }
  }
  return best ?? VIEW_META["/dashboard"];
}
