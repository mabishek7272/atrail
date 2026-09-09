"use client";

import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { Building2, Users, Plus } from "lucide-react";

export default function ResellerDashboard() {
  const { user } = useAuthStore();
  const [reseller, setReseller] = useState<any>(null);

  useEffect(() => {
    authedFetch<any>("/resellers")
      .then((r) => {
        const mine = (r.resellers ?? []).find((rs: any) => rs.owner?.id === user?.id || rs.ownerId === user?.id);
        setReseller(mine ?? r.resellers?.[0] ?? null);
      })
      .catch(() => {});
  }, [user?.id]);

  return (
    <AppShell title="Reseller Dashboard" subtitle="Manage your client organizations">
      <div className="space-y-6">
        <div className="rounded-xl p-5 flex items-center gap-4"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.08),rgba(0,212,255,0.03))", border: "1px solid rgba(0,212,255,0.15)" }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)" }}>
            <Building2 size={22} className="text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">{reseller?.name ?? "Your Reseller Account"}</div>
            <div className="text-sm text-[#64748b]">Reseller Super Admin · {reseller?.organizations?.length ?? 0} client organizations</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent>
              <div className="text-2xl font-bold text-white">{reseller?.organizations?.length ?? 0}</div>
              <div className="text-xs text-[#64748b] mt-0.5">Client Organizations</div>
            </CardContent>
          </Card>
          <Link href="/reseller">
            <Card className="hover:border-primary/40 transition-colors cursor-pointer">
              <CardContent>
                <div className="flex items-center gap-2 text-primary">
                  <Plus size={16} />
                  <span className="text-sm font-medium">Create New Org</span>
                </div>
                <div className="text-xs text-[#64748b] mt-1">Add a client organization</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader title="Quick Links" />
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Manage Tenants", href: "/organizations", icon: <Building2 size={16} /> },
                { label: "User Directory", href: "/directory",     icon: <Users size={16} /> },
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
