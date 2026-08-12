"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  FileText,
  ReceiptText,
  Wallet,
  Contact,
  Truck,
  Ruler,
  Upload,
  Users,
  Settings,
  HelpCircle,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "./actions";
import { OnboardingTour } from "./onboarding-tour";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tour: "nav-dashboard" },
  { href: "/products", label: "Products", icon: Package, tour: "nav-products" },
  { href: "/movements", label: "Stock History", icon: ArrowLeftRight, tour: "nav-movements" },
  { href: "/quotations", label: "Quotations", icon: FileText, admin: true, tour: "nav-quotations" },
  { href: "/invoices", label: "Invoices & Bills", icon: ReceiptText, admin: true, tour: "nav-invoices" },
  { href: "/expenses", label: "Expenses", icon: Wallet, admin: true, tour: "nav-expenses" },
  { href: "/customers", label: "Customers", icon: Contact, admin: true, tour: "nav-customers" },
  { href: "/vendors", label: "Vendors", icon: Truck, admin: true, tour: "nav-vendors" },
  { href: "/units", label: "Units", icon: Ruler, admin: true, tour: "nav-units" },
  { href: "/import", label: "Import / Export", icon: Upload, admin: true, tour: "nav-import" },
  { href: "/team", label: "Team", icon: Users, admin: true, tour: "nav-team" },
  { href: "/settings", label: "Settings", icon: Settings, admin: true, tour: "nav-settings" },
  { href: "/help", label: "Help Center", icon: HelpCircle, tour: "nav-help" },
];

type Role = "owner" | "admin" | "staff";

export function AppShell({
  role,
  orgName,
  orgLogoUrl,
  userName,
  children,
}: {
  role: Role;
  orgName: string;
  orgLogoUrl?: string | null;
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = role === "owner" || role === "admin";

  const links = NAV.filter((n) => !n.admin || isAdmin).map((n) => {
    const active = pathname === n.href || pathname.startsWith(n.href + "/");
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        data-tour={n.tour}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-(--color-primary-soft) text-(--color-primary)"
            : "text-(--color-muted) hover:bg-(--color-bg) hover:text-(--color-fg)",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
        {n.label}
      </Link>
    );
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop rail — fixed to the viewport so the menu never scrolls away */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface) md:flex">
        <Brand orgName={orgName} orgLogoUrl={orgLogoUrl} />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{links}</nav>
        <div className="px-3 pb-1">
          <OnboardingTour />
        </div>
        <UserFooter userName={userName} role={role} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          !open && "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-200 ease-[var(--ease-out)]",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-64 flex-col bg-(--color-surface) shadow-xl transition-transform duration-200 ease-[var(--ease-out)]",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-(--color-border)">
            <Brand orgName={orgName} orgLogoUrl={orgLogoUrl} border={false} />
            <button className="btn-ghost mr-2" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">{links}</nav>
          <div className="px-3 pb-1">
            <TourLauncher />
          </div>
          <UserFooter userName={userName} role={role} />
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-(--color-border) bg-(--color-surface) px-4 py-3 md:hidden">
          <button className="btn-ghost -ml-2" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">{orgName}</span>
        </header>

        {/* The only scrollable region — sidebar and header stay put */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Lightweight button (mobile drawer) that triggers the tour mounted in the rail. */
function TourLauncher() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("sw:start-tour"))}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-(--color-muted) transition-colors hover:bg-(--color-bg) hover:text-(--color-fg)"
    >
      Take a tour
    </button>
  );
}

function Brand({
  orgName,
  orgLogoUrl,
  border = true,
}: {
  orgName: string;
  orgLogoUrl?: string | null;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 py-4",
        border && "border-b border-(--color-border)",
      )}
    >
      {/* The org's own logo when they've uploaded one, else the app icon.
          object-contain so non-square logos aren't stretched. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={orgLogoUrl || "/icon.svg"}
        alt=""
        className="h-8 w-8 rounded-lg object-contain"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{orgName}</div>
        <div className="text-xs text-(--color-muted)">Stackwise</div>
      </div>
    </div>
  );
}

function UserFooter({ userName, role }: { userName: string; role: Role }) {
  return (
    <div className="border-t border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{userName}</div>
          <div className="text-xs capitalize text-(--color-muted)">{role}</div>
        </div>
        <form action={logoutAction}>
          <button className="btn-ghost" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
