"use client";

import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { Building2, Users, RefreshCw, Shield, Server, Activity } from "lucide-react";

export default function GodDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      authedFetch<any>("/organizations").catch(() => ({ organizations: [] })),
      authedFetch<any>("/analytics/overview").catch(() => ({ overview: null })),
    ]).then(([orgRes, statRes]) => {
      setOrgs(orgRes.organizations ?? []);
      setStats(statRes.overview ?? null);
    });
  }, []);

  return (
    <AppShell title="Platform Overview" subtitle="God-level dashboard — full system access">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="rounded-xl p-5 flex items-center gap-4"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.08),rgba(124,58,237,0.08))", border: "1px solid rgba(0,212,255,0.15)" }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#00d4ff,#7c3aed)", boxShadow: "0 0 20px rgba(0,212,255,0.3)" }}>
            <Shield size={22} className="text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">Welcome, {user?.fullName}</div>
            <div className="text-sm text-[#64748b]">Platform Owner · Full unrestricted access to all organizations and features</div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Organizations", value: orgs.length, icon: <Building2 size={18} />, href: "/organizations" },
            { label: "Total Users",   value: stats?.totalUsers ?? "—", icon: <Users size={18} />, href: "/directory" },
            { label: "Active Tasks",  value: stats?.totalTasks ?? "—", icon: <Activity size={18} />, href: "/tasks" },
            { label: "Renewals",      value: "—", icon: <RefreshCw size={18} />, href: "/renewals" },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">{s.value}</div>
                      <div className="text-xs text-[#64748b] mt-0.5">{s.label}</div>
                    </div>
                    <div className="text-primary opacity-70">{s.icon}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <Card>
          <CardHeader title="Platform Management" />
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Manage Resellers", href: "/reseller", icon: <Building2 size={16} /> },
                { label: "All Tenants",      href: "/organizations", icon: <Server size={16} /> },
                { label: "User Directory",   href: "/directory", icon: <Users size={16} /> },
                { label: "Developer Panel",  href: "/developer", icon: <Shield size={16} /> },
                { label: "Analytics",        href: "/analytics", icon: <Activity size={16} /> },
                { label: "Settings",         href: "/settings", icon: <Shield size={16} /> },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-[#94a3b8] hover:text-primary transition-colors"
                  style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.08)" }}>
                  <span className="text-primary">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
