"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import Protected from "./Protected";
import Modal from "./ui/Modal";
import BillingBanner from "./BillingBanner";
import { useAuthStore } from "../lib/auth-store";
import { authedFetch } from "../lib/authed-fetch";
import {
  LayoutDashboard, Clock, MessageSquare, Briefcase, CheckSquare,
  CalendarDays, Bell, AlertTriangle, Users, Building2, BarChart3,
  Heart, Package, Shield, FileText, Settings, LogOut, Menu, X,
  ChevronRight, Zap, Search, Kanban, Receipt, Map, TrendingUp, Wallet,
  RefreshCw,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ReactNode; roles?: string[] };

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname.startsWith("/dashboard");
  return pathname === href || pathname.startsWith(href + "/");
}

const ROLE_W: Record<string, number> = {
  GOD: 200, DEVELOPER: 190, RESELLER_SUPER_ADMIN: 150,
  ADMIN: 100, ELITE: 80, USER: 70, INTERN: 30,
};

function resolveDashboardHref(role?: string) {
  const w = ROLE_W[role ?? ""] ?? 0;
  if (w >= ROLE_W["GOD"])                  return "/dashboard/god";
  if (w >= ROLE_W["RESELLER_SUPER_ADMIN"]) return "/dashboard/reseller";
  if (role === "ADMIN")                    return "/dashboard/admin";
  if (role === "ELITE")                    return "/dashboard/elite";
  return "/dashboard/user";
}

function initials(name?: string) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

function NavLink({
  href, label, icon, active, collapsed, onNavigate,
}: {
  href: string; label: string; icon: React.ReactNode;
  active: boolean; collapsed: boolean; onNavigate?: () => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  return (
    <Link
      ref={ref}
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
        "transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "overflow-hidden",
        active
          ? "bg-[rgba(0,212,255,0.1)] text-primary shadow-[inset_0_0_0_1px_rgba(0,212,255,0.15),0_0_20px_rgba(0,212,255,0.05)]"
          : "text-[#64748b] hover:text-[#e2e8f0] hover:bg-[rgba(255,255,255,0.04)]",
      ].join(" ")}
    >
      {/* Active indicator */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-2/3 rounded-r-full bg-primary"
          style={{ boxShadow: "0 0 12px rgba(0,212,255,0.7), 0 0 24px rgba(0,212,255,0.3)" }}
        />
      )}

      {/* Shimmer on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%]
          bg-gradient-to-r from-transparent via-white/4 to-transparent transition-transform duration-700"
      />

      {/* Icon */}
      <span
        className={[
          "flex-shrink-0 w-4 h-4 transition-all duration-200",
          active
            ? "text-primary drop-shadow-[0_0_6px_rgba(0,212,255,0.8)]"
            : "text-[#64748b] group-hover:text-[#94a3b8]",
        ].join(" ")}
      >
        {icon}
      </span>

      {/* Label */}
      {!collapsed && (
        <span className="flex-1 truncate leading-none">{label}</span>
      )}

      {/* Arrow */}
      {!collapsed && (
        <ChevronRight
          size={12}
          className={[
            "flex-shrink-0 transition-all duration-200",
            active ? "opacity-70 text-primary" : "opacity-0 group-hover:opacity-40",
          ].join(" ")}
        />
      )}

      {/* Collapsed tooltip */}
      {collapsed && (
        <span
          className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2
            bg-[rgba(6,22,40,0.95)] border border-[rgba(0,212,255,0.15)] rounded-lg
            px-3 py-1.5 text-xs font-medium text-[#e2e8f0] whitespace-nowrap
            opacity-0 group-hover:opacity-100 transition-opacity duration-150
            backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.4)] z-50"
        >
          {label}
        </span>
      )}
    </Link>
  );
}

function SideNav({
  pathname, role, fullName, collapsed, onNavigate,
}: {
  pathname: string; role?: string; fullName?: string;
  collapsed: boolean; onNavigate?: () => void;
}) {
  const dashboardHref = resolveDashboardHref(role);

  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string }[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (user && (ROLE_W[user.role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"]) {
      authedFetch<{ ok: true; organizations: { id: string; name: string }[] }>("/organizations")
        .then((res) => {
          if (res.organizations) setAllOrgs(res.organizations);
        })
        .catch(console.error);
    }
  }, [user?.role]);

  const handleSwitchOrg = async (orgId: string) => {
    if (!orgId) return;

    // Special handling for "Overall" view (GOD users seeing all orgs)
    if (orgId === "OVERALL") {
      // GOD users can already see all projects, just reload to refresh
      window.location.reload();
      return;
    }

    if (orgId === user?.organizationId) return;
    setSwitching(true);
    try {
      const res = await authedFetch<{ ok: true; accessToken: string; user: any }>("/auth/switch-org", {
        method: "POST",
        body: JSON.stringify({ orgId }),
      });
      if (res.ok && res.accessToken) {
        setAuth(res.accessToken, res.user);
        // Wait for localStorage to persist before reloading
        setTimeout(() => window.location.reload(), 200);
      }
    } catch (e: any) {
      alert(e.message || "Failed to switch organization context");
    } finally {
      setSwitching(false);
    }
  };

  const currentOrgId = user?.organizationId || "";
  const isSuper = user && (ROLE_W[user.role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
  
  let switchableOrgs: { id: string; name: string }[] = [];
  if (isSuper) {
    switchableOrgs = allOrgs;
  } else {
    const list: { id: string; name: string }[] = [];
    if (user?.organization) {
      list.push(user.organization);
    } else if (user?.organizationId) {
      list.push({ id: user.organizationId, name: "Primary Organization" });
    }
    if (user?.accessibleOrgs) {
      for (const ao of user.accessibleOrgs) {
        if (!list.some(item => item.id === ao.organizationId)) {
          list.push({ id: ao.organizationId, name: ao.organization.name });
        }
      }
    }
    switchableOrgs = list;
  }

  // Weight-based role check — GOD sees everything, each item has a minimum weight
  const rw = ROLE_W[role ?? ""] ?? 0;
  const god      = rw >= ROLE_W["GOD"];
  const reseller = rw >= ROLE_W["RESELLER_SUPER_ADMIN"];
  const admin    = rw >= ROLE_W["ADMIN"];
  const elite    = rw >= ROLE_W["ELITE"];
  const user_    = rw >= ROLE_W["USER"];

  const NAV = [
    // ── Platform ─────────────────────────────────────────────────────────────
    { href: "/developer",           label: "Developer Panel",   icon: <Shield size={16} />,        show: god },
    { href: "/reseller",            label: "Resellers",         icon: <Building2 size={16} />,     show: reseller },
    { href: "/organizations",       label: "Tenants",           icon: <Building2 size={16} />,     show: reseller },
    // ── Core ─────────────────────────────────────────────────────────────────
    { href: "/dashboard",           label: "Dashboard",         icon: <LayoutDashboard size={16} />, show: true },
    // ── Renewal OS ───────────────────────────────────────────────────────────
    { href: "/renewals",            label: "Renewals",          icon: <RefreshCw size={16} />,     show: true },
    { href: "/dashboard/customers", label: "Customers",         icon: <Users size={16} />,         show: admin },
    { href: "/commissions",         label: "Commissions",       icon: <Wallet size={16} />,        show: true },
    { href: "/finance",             label: "Finance",           icon: <Receipt size={16} />,       show: admin },
    // ── Workforce ────────────────────────────────────────────────────────────
    { href: "/projects",            label: "Projects",          icon: <Briefcase size={16} />,     show: true },
    { href: "/tasks",               label: "Tasks",             icon: <CheckSquare size={16} />,   show: user_ },
    { href: "/kanban",              label: "Kanban",            icon: <Kanban size={16} />,        show: elite },
    { href: "/roadmap",             label: "Roadmap",           icon: <Map size={16} />,           show: true },
    { href: "/calendar",            label: "Calendar",          icon: <CalendarDays size={16} />,  show: true },
    { href: "/attendance",          label: "Attendance",        icon: <Clock size={16} />,         show: user_ },
    { href: "/chat",                label: "Chat",              icon: <MessageSquare size={16} />, show: true },
    { href: "/notices",             label: "Notices",           icon: <Bell size={16} />,          show: true },
    { href: "/emergency",           label: "Emergency",         icon: <AlertTriangle size={16} />, show: true },
    // ── HR & Assets ──────────────────────────────────────────────────────────
    { href: "/hr",                  label: "HR & Leaves",       icon: <Heart size={16} />,         show: user_ },
    { href: "/assets",              label: "Assets",            icon: <Package size={16} />,       show: admin },
    { href: "/licenses",            label: "Licenses",          icon: <Shield size={16} />,        show: admin },
    { href: "/documents",           label: "Documents",         icon: <FileText size={16} />,      show: true },
    // ── Reports & Directory ──────────────────────────────────────────────────
    { href: "/analytics",           label: "Analytics",         icon: <BarChart3 size={16} />,     show: elite },
    { href: "/directory",           label: "Directory",         icon: <Users size={16} />,         show: admin },
    { href: "/integrations",        label: "Integrations",      icon: <Zap size={16} />,           show: true },
    { href: "/settings",            label: "Settings",          icon: <Settings size={16} />,      show: true },
  ];

  const items = NAV.filter((n) => n.show);
  const userInitials = initials(fullName);

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={[
        "flex items-center gap-3 px-4 py-5 mb-2",
        collapsed ? "justify-center" : "",
      ].join(" ")}>
        <div
          className="relative flex-shrink-0 rounded-xl flex items-center justify-center"
          style={{
            width: "50px",
            height: "50px",
            background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(124,58,237,0.1))",
            border: "1px solid rgba(0,212,255,0.25)",
            boxShadow: "0 0 20px rgba(0,212,255,0.1)",
          }}
        >
          <img src="/icon.png" alt="ATRAIL" className="w-10 h-10 object-contain" />
          <span
            className="absolute inset-0 rounded-xl border border-primary/20"
            style={{ animation: "breathe 4s ease-in-out infinite" }}
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div
              className="text-sm font-bold tracking-[0.12em] uppercase"
              style={{
                background: "linear-gradient(135deg, #00d4ff, #7dd3fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ATRAIL
            </div>
            <div className="text-[10px] text-[#64748b] font-medium truncate">
              Enterprise Platform
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-[rgba(0,212,255,0.15)] to-transparent" />

      {/* User pill */}
      {!collapsed && fullName && (
        <div
          className="mx-4 mb-4 px-3 py-2.5 rounded-xl flex items-center gap-3"
          style={{
            background: "rgba(0,212,255,0.05)",
            border: "1px solid rgba(0,212,255,0.1)",
          }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 text-bg"
            style={{ background: "linear-gradient(135deg, #00d4ff, #0284c7)" }}
          >
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#e2e8f0] truncate">{fullName}</div>
            <div className="text-[10px] text-[#64748b] uppercase tracking-wider mt-px">
              {role === "RESELLER_SUPER_ADMIN" ? "Reseller Admin"
               : role === "GOD" ? "Platform Owner"
               : role === "DEVELOPER" ? "Developer"
               : role?.replace(/_/g, " ") ?? "Member"}
            </div>
            {(isSuper || switchableOrgs.length > 1) && (
              <div className="mt-2">
                <select
                  disabled={switching}
                  value={currentOrgId}
                  onChange={(e) => handleSwitchOrg(e.target.value)}
                  className="w-full bg-[#020b18]/60 text-[10px] text-primary border border-primary/20 rounded px-1.5 py-0.5 outline-none focus:border-primary cursor-pointer font-medium"
                >
                  {god && (
                    <option value="OVERALL" className="bg-[#020b18] text-[#e2e8f0]">
                      📊 Overall (All Organizations)
                    </option>
                  )}
                  {switchableOrgs.length === 0 ? (
                    <option value={currentOrgId} className="bg-[#020b18] text-[#e2e8f0]">
                      {user?.organization?.name || "Loading..."}
                    </option>
                  ) : (
                    switchableOrgs.map((org) => (
                      <option key={org.id} value={org.id} className="bg-[#020b18] text-[#e2e8f0]">
                        {org.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>
          <div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
            style={{ boxShadow: "0 0 8px rgba(52,211,153,0.7)" }}
          />
        </div>
      )}

      {/* Navigation */}
      <nav className={["flex-1 overflow-y-auto space-y-0.5", collapsed ? "px-2" : "px-3"].join(" ")}>
        {items.map((it, i) => {
          const href  = it.href === "/dashboard" ? dashboardHref : it.href;
          const active = it.href === "/dashboard"
            ? pathname.startsWith("/dashboard")
            : isActive(pathname, it.href);

          return (
            <div
              key={it.href}
              style={{ animation: `slide-in-left 0.3s ease ${i * 0.03}s both` }}
            >
              <NavLink
                href={href}
                label={it.label}
                icon={it.icon}
                active={active}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </div>
          );
        })}
      </nav>

      {/* Bottom: status */}
      {!collapsed && (
        <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.12)" }}>
          <div className="relative">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <div
              className="absolute inset-0 rounded-full bg-emerald-400 opacity-60"
              style={{ animation: "ping-slow 2s cubic-bezier(0,0,0.2,1) infinite" }}
            />
          </div>
          <span className="text-[10px] text-[#64748b] font-medium tracking-wider uppercase flex-1">
            All Systems Online
          </span>
          <Zap size={10} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
}

/* ── Emergency Alert Banner ── */
type EmergencyEvent = {
  id: string; status: "ACTIVE" | "RESOLVED" | "CANCELLED";
  reason: string | null; triggeredAt: string;
  triggeredBy: { id: string; fullName: string; role: string };
  conversationId: string | null;
};

function EmergencyAlertBanner() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [activeEmergencies, setActiveEmergencies] = useState<EmergencyEvent[]>([]);

  const loadActiveEmergencies = async () => {
    if (!user) { setActiveEmergencies([]); return; }
    try {
      const res = await authedFetch<{ ok: true; events: EmergencyEvent[] }>("/emergency/active");
      setActiveEmergencies(res.events ?? []);
    } catch (e: any) {
      if (e?.status === 401) setActiveEmergencies([]);
    }
  };

  useEffect(() => {
    if (!user) { setActiveEmergencies([]); return; }
    loadActiveEmergencies();
    const interval = setInterval(() => { if (user) loadActiveEmergencies(); }, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !accessToken) return;
    let socket: any = null;
    try {
      const { getSocket } = require("../lib/socket-client");
      socket = getSocket(accessToken);
      if (!socket) return;
      const handler = (event: EmergencyEvent) => {
        if (event.status === "ACTIVE") {
          setActiveEmergencies((prev) => {
            const existing = prev.find((e) => e.id === event.id);
            return existing
              ? prev.map((e) => (e.id === event.id ? { ...e, ...event } : e))
              : [...prev, event];
          });
        } else {
          setActiveEmergencies((prev) => prev.filter((e) => e.id !== event.id));
        }
      };
      socket.on("emergency:status", handler);
      return () => { if (socket) socket.off("emergency:status", handler); };
    } catch {}
  }, [user, accessToken]);

  if (activeEmergencies.length === 0) return null;

  const handleClick = async (event: EmergencyEvent) => {
    if (!event.conversationId) {
      try {
        const res = await authedFetch<{ ok: true; conversation: { id: string } }>(
          `/emergency/${event.id}/conversation`
        );
        router.push(`/chat/${res.conversation.id}`);
      } catch {
        router.push("/emergency");
      }
    } else {
      router.push(`/chat/${event.conversationId}`);
    }
  };

  return (
    <div
      className="border-b"
      style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))",
        borderColor: "rgba(239,68,68,0.3)",
        backdropFilter: "blur(8px)",
        animation: "slide-down 0.3s ease both",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-3 space-y-2">
        {activeEmergencies.map((event) => (
          <button
            key={event.id}
            onClick={() => handleClick(event)}
            className="w-full text-left flex items-center justify-between gap-4 px-4 py-3
              rounded-xl transition-all duration-200
              hover:bg-[rgba(239,68,68,0.12)] active:scale-[0.99]"
            style={{ border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div
                  className="absolute inset-0 rounded-full bg-red-500 opacity-60"
                  style={{ animation: "ping-slow 1.5s ease-in-out infinite" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-red-300 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  EMERGENCY ALERT
                </div>
                <div className="text-xs text-red-400/70 mt-0.5 truncate font-medium">
                  Triggered by {event.triggeredBy.fullName}
                  {event.reason && ` · ${event.reason}`}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-red-400 font-semibold">
              Join Chat <ChevronRight size={12} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

import TwoFactorSetupBanner from "./TwoFactorSetupBanner";
import { AiAssistant } from "./AiAssistant";
import CommandPalette from "./CommandPalette";

/* ── Shell context — set by the top-level AppShell so nested calls know
   they are already inside a layout and only need to update the header. ── */
type ShellCtx = {
  setHeader: (title: string, subtitle?: string, right?: React.ReactNode) => void;
};
const AppShellCtx = createContext<ShellCtx | null>(null);

export default function AppShell({
  title, subtitle, right, children,
}: {
  title?: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  const parent = useContext(AppShellCtx);

  /* ── Nested mode: already inside a layout AppShell.
     Just update the header and render children — no sidebar, no Protected. ── */
  if (parent) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      parent.setHeader(title ?? "", subtitle, undefined);
    // Update whenever page-level props change (title, subtitle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, subtitle]);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setMounted(true);
    }, []);

    const target = mounted ? document.getElementById("appshell-header-right") : null;

    return (
      <>
        {target && right ? createPortal(<>{right}</>, target) : null}
        {children}
      </>
    );
  }

  /* ── Standalone / layout-root mode: render the full shell. ── */
  return <AppShellRoot title={title ?? ""} subtitle={subtitle} right={right}>{children}</AppShellRoot>;
}

function AppShellRoot({
  title: initTitle, subtitle: initSubtitle, right: initRight, children,
}: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  const [pageTitle,    setPageTitle]    = useState(initTitle);
  const [pageSubtitle, setPageSubtitle] = useState(initSubtitle);
  const [pageRight,    setPageRight]    = useState<React.ReactNode>(initRight ?? null);

  const shellCtx = useMemo<ShellCtx>(() => ({
    setHeader: (t, s, r) => {
      setPageTitle(t);
      setPageSubtitle(s);
      setPageRight(r ?? null);
    },
  // stable — created once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const title    = pageTitle;
  const subtitle = pageSubtitle;
  const headerRight = pageRight ? <div className="flex items-center gap-2">{pageRight}</div> : null;

  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [paletteOpen,   setPaletteOpen]   = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const role = user?.role;
  const fullName = user?.fullName;

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const onLogout = async () => {
    try {
      const { closeSocket } = await import("../lib/socket-client");
      closeSocket();
      const { logout } = await import("../lib/auth");
      await logout();
    } catch {}
    finally {
      clear();
      window.location.href = "/login";
    }
  };

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  return (
    <AppShellCtx.Provider value={shellCtx}>
    <Protected>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <TwoFactorSetupBanner />

      <div className="min-h-screen bg-transparent">
        <EmergencyAlertBanner />

        <div className="flex">
          {/* ── Desktop Sidebar ── */}
          <aside
            className={[
              "hidden md:flex flex-col min-h-screen flex-shrink-0 transition-all duration-300",
              sidebarWidth,
            ].join(" ")}
            style={{
              background: "linear-gradient(180deg, rgba(6,22,40,0.98) 0%, rgba(2,11,24,0.99) 100%)",
              borderRight: "1px solid rgba(0,212,255,0.08)",
              boxShadow: "4px 0 40px rgba(0,0,0,0.4), 2px 0 12px rgba(0,212,255,0.02)",
              backdropFilter: "blur(32px)",
            }}
          >
            <div className="flex flex-col h-full pt-3 pb-4">
              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed((v) => !v)}
                aria-label="Toggle sidebar"
                className={[
                  "mb-1 mx-3 flex items-center justify-center w-7 h-7 rounded-lg",
                  "text-[#64748b] hover:text-[#94a3b8] hover:bg-white/4 transition-all duration-200",
                  collapsed ? "self-center" : "self-end",
                ].join(" ")}
              >
                {collapsed ? <ChevronRight size={14} /> : <X size={14} />}
              </button>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <SideNav
                  pathname={pathname}
                  role={role}
                  fullName={fullName}
                  collapsed={collapsed}
                />
              </div>

              {/* Logout button */}
              <div className={["px-3 pt-3 border-t border-[rgba(0,212,255,0.06)]", collapsed ? "" : ""].join(" ")}>
                <button
                  onClick={onLogout}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
                    "text-[#64748b] hover:text-red-400 hover:bg-[rgba(239,68,68,0.06)]",
                    "transition-all duration-200",
                    collapsed ? "justify-center" : "",
                  ].join(" ")}
                >
                  <LogOut size={16} className="flex-shrink-0" />
                  {!collapsed && <span>Logout</span>}
                </button>
                {!collapsed && (
                  <div className="text-center text-[9px] text-[#374151] font-medium tracking-wider uppercase mt-2 px-1">
                    Made by Cocoon AI · Powered by beAIte
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main className="flex-1 min-w-0 flex flex-col">
            {/* Billing Banner — shown for TRIALING, PAST_DUE, SUSPENDED, CANCELLED */}
            <BillingBanner />
            {/* Topbar */}
            <header
              className="sticky top-0 z-30"
              style={{
                background: "rgba(2,11,24,0.88)",
                borderBottom: "1px solid rgba(0,212,255,0.06)",
                boxShadow: "0 2px 24px rgba(0,0,0,0.4)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              {/* Top accent line */}
              <div
                className="h-px"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.3), rgba(124,58,237,0.2), transparent)",
                }}
              />
              <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile hamburger */}
                  <button
                    aria-label="Open navigation"
                    onClick={() => setMobileOpen(true)}
                    className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl
                      text-[#64748b] hover:text-[#e2e8f0] hover:bg-white/5
                      border border-[rgba(0,212,255,0.1)] transition-all duration-200"
                  >
                    <Menu size={16} />
                  </button>

                  <div className="min-w-0">
                    <h1
                      className="text-lg font-semibold tracking-tight truncate"
                      style={{ color: "#e2e8f0" }}
                    >
                      {title}
                    </h1>
                    {subtitle && (
                      <p className="text-xs text-[#64748b] mt-0.5 truncate font-medium">{subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {headerRight}
                  <div id="appshell-header-right" className="flex items-center gap-2" />
                  {/* Global Search trigger */}
                  <button
                    onClick={() => setPaletteOpen(true)}
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-text-muted hover:text-white transition-all duration-200"
                    style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.1)" }}
                    title="Global Search (Ctrl+K)"
                  >
                    <Search size={13} />
                    <span className="hidden md:inline">Search</span>
                    <kbd className="hidden md:inline text-[9px] px-1 py-0.5 rounded bg-[rgba(0,212,255,0.06)] font-mono">⌘K</kbd>
                  </button>
                </div>
              </div>
            </header>

            {/* Page content */}
            <div
              className="flex-1 max-w-7xl mx-auto p-5 w-full"
              style={{ animation: "fade-in 0.35s ease both" }}
            >
              {children}
            </div>
          </main>
        </div>

        {/* Mobile drawer */}
        <Modal
          open={mobileOpen}
          title="Navigation"
          subtitle={fullName ?? "Account"}
          onClose={() => setMobileOpen(false)}
          widthClass="max-w-sm"
          footer={
            <div className="space-y-3">
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4
                  rounded-xl text-sm font-semibold text-red-400
                  bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)]
                  hover:bg-[rgba(239,68,68,0.14)] transition-all duration-200"
              >
                <LogOut size={15} /> Logout
              </button>
              <div className="text-center text-[9px] text-[#374151] font-medium tracking-wider uppercase">
                Made by Cocoon AI · Powered by beAIte
              </div>
            </div>
          }
        >
          <SideNav
            pathname={pathname}
            role={role}
            fullName={fullName}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </Modal>
      </div>

      <AiAssistant />
    </Protected>
    </AppShellCtx.Provider>
  );
}
