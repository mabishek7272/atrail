"use client";

import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { Building2, Plus, Users, ChevronRight, X } from "lucide-react";

export default function ResellerPage() {
  const { user } = useAuthStore();
  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState<string | null>(null); // resellerId
  const [form, setForm] = useState({ resellerName: "", ownerFullName: "", ownerEmail: "", ownerPassword: "", ownerOrgId: user?.organizationId ?? "" });
  const [orgForm, setOrgForm] = useState({ orgName: "", adminFullName: "", adminEmail: "", adminPassword: "", planName: "Starter" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isGod = user?.role === "GOD" || user?.role === "DEVELOPER";

  const load = () => {
    setLoading(true);
    authedFetch<any>("/resellers")
      .then((r) => setResellers(r.resellers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreateReseller = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await authedFetch<any>("/resellers", { method: "POST", body: JSON.stringify({ ...form, ownerOrgId: user?.organizationId }) });
      setShowCreate(false);
      setForm({ resellerName: "", ownerFullName: "", ownerEmail: "", ownerPassword: "", ownerOrgId: "" });
      load();
    } catch (e: any) { setError(e.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showCreateOrg) return;
    setSaving(true); setError("");
    try {
      await authedFetch<any>(`/resellers/${showCreateOrg}/orgs`, { method: "POST", body: JSON.stringify(orgForm) });
      setShowCreateOrg(null);
      setOrgForm({ orgName: "", adminFullName: "", adminEmail: "", adminPassword: "", planName: "Starter" });
      load();
    } catch (e: any) { setError(e.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell title="Reseller Management" subtitle="Create and manage resellers and their client organizations">
      <div className="space-y-6">

        {/* Header actions */}
        {isGod && (
          <div className="flex justify-end">
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-bg transition-all"
              style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)" }}>
              <Plus size={15} /> New Reseller
            </button>
          </div>
        )}

        {/* Create Reseller Modal */}
        {showCreate && (
          <Card>
            <CardHeader title="Create New Reseller" subtitle="This will create a reseller account and its owner login" />
            <CardContent>
              <form onSubmit={handleCreateReseller} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "resellerName", label: "Reseller / Company Name", placeholder: "Acme Solutions Pvt Ltd" },
                  { key: "ownerFullName", label: "Owner Full Name", placeholder: "John Doe" },
                  { key: "ownerEmail", label: "Owner Email", placeholder: "john@acme.com" },
                  { key: "ownerPassword", label: "Initial Password", placeholder: "min 8 chars", type: "password" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs text-[#64748b] mb-1.5 font-medium">{f.label}</label>
                    <input
                      type={f.type ?? "text"}
                      placeholder={f.placeholder}
                      value={(form as any)[f.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      required
                      className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-primary/50"
                    />
                  </div>
                ))}
                {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
                <div className="col-span-2 flex gap-3">
                  <button type="submit" disabled={saving}
                    className="px-5 py-2 rounded-xl text-sm font-semibold text-bg disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)" }}>
                    {saving ? "Creating…" : "Create Reseller"}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-[#64748b] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Reseller list */}
        {loading ? (
          <div className="text-[#64748b] text-sm">Loading resellers…</div>
        ) : resellers.length === 0 ? (
          <Card><CardContent><p className="text-[#64748b] text-sm text-center py-6">No resellers yet. {isGod && "Click \"New Reseller\" to add one."}</p></CardContent></Card>
        ) : (
          resellers.map((r) => (
            <Card key={r.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.15),rgba(124,58,237,0.1))", border: "1px solid rgba(0,212,255,0.2)" }}>
                      <Building2 size={18} className="text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{r.name}</div>
                      <div className="text-xs text-[#64748b] mt-0.5">
                        Owner: {r.owner?.fullName} · {r.owner?.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="cyan">{r.organizations?.length ?? 0} orgs</Badge>
                    {(isGod || r.owner?.id === user?.id) && (
                      <button onClick={() => { setShowCreateOrg(r.id); setError(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors">
                        <Plus size={12} /> Add Org
                      </button>
                    )}
                  </div>
                </div>

                {/* Client orgs under this reseller */}
                {r.organizations?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs text-[#64748b] font-medium uppercase tracking-wider">Client Organizations</div>
                    {r.organizations.map((org: any) => (
                      <div key={org.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.07)" }}>
                        <div className="flex items-center gap-2">
                          <Users size={13} className="text-[#64748b]" />
                          <span className="text-sm text-[#e2e8f0]">{org.name}</span>
                          <Badge tone={org.billingStatus === "ACTIVE" ? "green" : "amber"}>{org.billingStatus}</Badge>
                        </div>
                        <ChevronRight size={13} className="text-[#64748b]" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Create org inline form */}
                {showCreateOrg === r.id && (
                  <form onSubmit={handleCreateOrg} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[rgba(0,212,255,0.08)]">
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Add Client Organization under {r.name}</span>
                      <button type="button" onClick={() => setShowCreateOrg(null)}><X size={15} className="text-[#64748b]" /></button>
                    </div>
                    {[
                      { key: "orgName", label: "Organization Name", placeholder: "Client Corp Ltd" },
                      { key: "planName", label: "Plan", placeholder: "Starter" },
                      { key: "adminFullName", label: "Admin Full Name", placeholder: "Jane Admin" },
                      { key: "adminEmail", label: "Admin Email", placeholder: "admin@client.com" },
                      { key: "adminPassword", label: "Admin Password", placeholder: "min 8 chars", type: "password" },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs text-[#64748b] mb-1.5 font-medium">{f.label}</label>
                        <input
                          type={f.type ?? "text"}
                          placeholder={f.placeholder}
                          value={(orgForm as any)[f.key]}
                          onChange={(e) => setOrgForm((p) => ({ ...p, [f.key]: e.target.value }))}
                          required={f.key !== "planName"}
                          className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    ))}
                    {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
                    <div className="col-span-2 flex gap-3">
                      <button type="submit" disabled={saving}
                        className="px-5 py-2 rounded-xl text-sm font-semibold text-bg disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)" }}>
                        {saving ? "Creating…" : "Create Organization"}
                      </button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
