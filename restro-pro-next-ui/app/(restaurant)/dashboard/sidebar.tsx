"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; roles?: string[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/pos", label: "Point of Sale" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/customers", label: "Customers" },
      { href: "/dashboard/menu", label: "Menu" },
      { href: "/dashboard/inventory", label: "Inventory" },
      { href: "/dashboard/restock", label: "Restock" },
      { href: "/dashboard/suppliers", label: "Suppliers" },
      { href: "/dashboard/supplier-ledger", label: "Supplier Ledger" },
      { href: "/dashboard/employee-ledger", label: "Employee Ledger" },
      { href: "/dashboard/accounts", label: "Accounts" },
      { href: "/dashboard/expenses", label: "Expenses" },
    ],
  },
  {
    label: "Configure",
    items: [{ href: "/dashboard/tables-delivery", label: "Tables & Delivery" }],
  },
  {
    label: "System",
    items: [
      { href: "/dashboard/settings", label: "Settings", roles: ["admin"] },
      { href: "/dashboard/permissions", label: "Users & Permissions", roles: ["admin"] },
    ],
  },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar shrink-0 hidden md:flex md:flex-col overflow-y-auto">
      <div className="brand-row">
        <div className="brand-mark">R</div>
        <div>
          <strong className="brand-name">Restro Pro</strong>
          <span className="brand-kicker">Ops Console</span>
        </div>
      </div>
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter((i) => !i.roles || i.roles.includes(role));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.label} className="mb-4">
            <div className="nav-label">{group.label}</div>
            {visibleItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                >
                  <span className="nav-dot" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
      <div className="sidebar-foot">
        <div className="shift-pill"><i />Shift active</div>
      </div>
    </aside>
  );
}
