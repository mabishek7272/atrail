"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore, ALL_FEATURES_ON, type Role } from "../lib/auth-store";
import { authedFetch } from "../lib/authed-fetch";

const WEIGHT: Record<string, number> = {
  GOD: 200, DEVELOPER: 190, RESELLER_SUPER_ADMIN: 150,
  ADMIN: 100, ELITE: 80, USER: 70, INTERN: 30,
};
const w = (role?: string) => WEIGHT[role ?? ""] ?? 0;

function dashboardPath(role?: Role): string {
  if (!role) return "/login";
  if (w(role) >= WEIGHT["GOD"])                  return "/dashboard/god";
  if (w(role) >= WEIGHT["RESELLER_SUPER_ADMIN"]) return "/dashboard/reseller";
  if (role === "ADMIN")                           return "/dashboard/admin";
  if (role === "ELITE")                           return "/dashboard/elite";
  return "/dashboard/user";
}

export default function AppNav() {
  const pathname = usePathname();
  const { user, featureFlags, setFeatureFlags } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    if (w(user.role) >= WEIGHT["RESELLER_SUPER_ADMIN"]) {
      setFeatureFlags(ALL_FEATURES_ON);
      return;
    }
    authedFetch<any>("/feature-flags")
      .then((r) => { if (r?.flags) setFeatureFlags(r.flags); })
      .catch(() => {});
  }, [user?.id]);

  if (!user) return null;

  const f = featureFlags;
  const isGod      = w(user.role) >= WEIGHT["GOD"];
  const isReseller = w(user.role) >= WEIGHT["RESELLER_SUPER_ADMIN"];
  const isAdmin    = w(user.role) >= WEIGHT["ADMIN"];
  const isElite    = w(user.role) >= WEIGHT["ELITE"];

  const NAV = [
    { href: dashboardPath(user.role), label: "Dashboard",   show: true },
    // Renewal OS
    { href: "/renewals",              label: "Renewals",    show: f.renewals },
    { href: "/dashboard/customers",   label: "Customers",   show: f.customers },
    { href: "/commissions",           label: "Commissions", show: f.commissions },
    { href: "/finance",               label: "Finance",     show: f.finance && isAdmin },
    // Core
    { href: "/projects",              label: "Projects",    show: f.projects },
    { href: "/tasks",                 label: "Tasks",       show: f.tasks },
    { href: "/kanban",                label: "Kanban",      show: f.kanban && isElite },
    { href: "/calendar",              label: "Calendar",    show: f.calendar },
    { href: "/chat",                  label: "Chat",        show: f.chat },
    { href: "/attendance",            label: "Attendance",  show: f.attendance },
    { href: "/notices",               label: "Notices",     show: f.notices },
    { href: "/emergency",             label: "Emergency",   show: f.emergency },
    // HR & Assets
    { href: "/hr",                    label: "HR",          show: f.hr },
    { href: "/assets",                label: "Assets",      show: f.assets && isAdmin },
    { href: "/licenses",              label: "Licenses",    show: f.licenses },
    { href: "/documents",             label: "Documents",   show: f.documents },
    // Analytics & Integrations
    { href: "/analytics",             label: "Analytics",   show: f.analytics && isElite },
    { href: "/integrations",          label: "Integrations",show: f.integrations && isAdmin },
    // Directory
    { href: "/directory",             label: "Directory",   show: isAdmin },
    // Platform mgmt
    { href: "/reseller",              label: "Resellers",   show: isReseller },
    { href: "/developer",             label: "Dev Tools",   show: isGod },
  ];

  const visible = NAV.filter(n => n.show);
  const isActive = (href: string) =>
    href === dashboardPath(user.role)
      ? pathname === href
      : pathname?.startsWith(href);

  return (
    <div className="border-b border-primary/20 bg-brand-black shadow-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center" style={{ width: 46, height: 46 }}>
            <img src="/icon.png" alt="Atrail" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-primary">ATRAIL</div>
            <div className="text-xs text-primary-light leading-tight">
              {user.fullName} · <span className="text-text-muted">{user.role}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end">
          {visible.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm transition-colors ${
                isActive(href)
                  ? "text-primary font-semibold underline"
                  : "text-text-main hover:text-primary hover:underline"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
