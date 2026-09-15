"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Package,
  RefreshCw,
  Truck,
  FileText,
  Wallet,
  Receipt,
  MapPin,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon; roles?: string[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pos", label: "Point of Sale", icon: ShoppingCart },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
      { href: "/dashboard/inventory", label: "Inventory", icon: Package },
      { href: "/dashboard/restock", label: "Restock", icon: RefreshCw },
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck },
      { href: "/dashboard/supplier-ledger", label: "Supplier Ledger", icon: FileText },
      { href: "/dashboard/employee-ledger", label: "Employee Ledger", icon: FileText },
      { href: "/dashboard/accounts", label: "Accounts", icon: Wallet },
      { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    label: "Configure",
    items: [{ href: "/dashboard/tables-delivery", label: "Tables & Delivery", icon: MapPin }],
  },
  {
    label: "System",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings, roles: ["admin"] },
      { href: "/dashboard/permissions", label: "Users & Permissions", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-surface p-4 hidden md:flex md:flex-col overflow-y-auto">
      <div className="mb-6 px-2">
        <div className="font-display text-lg font-semibold text-ink-strong">Restro Pro</div>
        <div className="text-[10px] text-ink-faint uppercase tracking-wide">Operations</div>
      </div>
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter((i) => !i.roles || i.roles.includes(role));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.label} className="mb-5">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-2 mb-2">{group.label}</div>
            {visibleItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm mb-0.5 transition-colors ${
                    active ? "bg-chili-500/15 text-chili-400 font-semibold" : "text-ink-mid hover:bg-hover hover:text-ink-strong"
                  }`}
                >
                  <Icon size={16} className={active ? "opacity-100" : "opacity-70"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
