"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { Building2, Users, Briefcase, Plus, RefreshCw, X, ChevronDown, ChevronUp } from "lucide-react";

type Org = {
  id: string;
  name: string;
  orgType: "INTERNAL" | "RESELLER" | "CLIENT";
  billingStatus: string;
  planName: string | null;
  createdAt: string;
  reseller?: { name: string } | null;
  _count?: { users: number; projects: number };
};

const TYPE_TONE: Record<string, "cyan" | "purple" | "green"> = {
  INTERNAL: "cyan", RESELLER: "purple", CLIENT: "green",
};

const BILLING_TONE: Record<string, "green" | "cyan" | "amber" | "red"> = {
  ACTIVE: "green", TRIALING: "cyan", PAST_DUE: "amber", SUSPENDED: "red", CANCELLED: "red",
};

const FIELD = ({ label, id, type = "text", value, onChange, placeholder, required = true }: any) => (
  <div>
    <label htmlFor={id} className="block text-xs text-[#64748b] mb-1.5 font-medium">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
    <input
      id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
      className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-primary/50 transition-colors"
    />
  </div>
);

export default function OrganizationsPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "GOD" && user.role !== "DEVELOPER" && user.role !== "RESELLER_SUPER_ADMIN") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showAdminSection, setShowAdminSection] = useState(true);
  const [createdCreds, setCreatedCreds] = useState<{ orgName: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 2000); });
  };

  const [form, setForm] = useState({
    name: "", orgType: "CLIENT", planName: "Starter",
    adminFullName: "", adminEmail: "", adminPassword: "",
  });

  const canCreate = user?.role === "GOD" || user?.role === "DEVELOPER" || user?.role === "RESELLER_SUPER_ADMIN";

  const load = () => {
    setLoading(true);
    authedFetch<{ ok: true; organizations: Org[] }>("/organizations")
      .then((r) => setOrgs(r.organizations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload: any = {
        name: form.name.trim(),
        orgType: form.orgType,
        planName: form.planName || "Starter",
      };
      if (form.adminFullName && form.adminEmail && form.adminPassword) {
        payload.adminFullName = form.adminFullName;
        payload.adminEmail    = form.adminEmail;
        payload.adminPassword = form.adminPassword;
      }
      const res = await authedFetch<any>("/organizations", { method: "POST", body: JSON.stringify(payload) });
      if (res.admin) {
        // Show credentials on screen — email may land in spam
        setCreatedCreds({ orgName: res.organization.name, email: res.admin.email, password: form.adminPassword });
      } else {
        setSuccess(`Organization "${res.organization.name}" created.`);
      }
      setForm({ name: "", orgType: "CLIENT", planName: "Starter", adminFullName: "", adminEmail: "", adminPassword: "" });
      setShowCreate(false);
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(q.toLowerCase()) ||
    o.orgType.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell title="Tenant Organizations" subtitle="All organizations on the Atrail platform">
      <div className="space-y-5">

        {/* Top bar */}
        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organizations…"
            className="flex-1 bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-primary/50" />
          <button onClick={load} className="p-2 rounded-xl border border-[rgba(0,212,255,0.12)] text-[#64748b] hover:text-primary transition-colors" title="Refresh">
            <RefreshCw size={15} />
          </button>
          {canCreate && (
            <button onClick={() => { setShowCreate(true); setError(""); setSuccess(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)", color: "#020b18" }}>
              <Plus size={15} /> New Organization
            </button>
          )}
        </div>

        {/* Success banner */}
        {success && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl text-sm text-emerald-300"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            {success}
            <button onClick={() => setSuccess("")}><X size={14} /></button>
          </div>
        )}

        {/* Credentials card — shown after successful creation with admin user */}
        {createdCreds && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.05)" }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ background: "rgba(16,185,129,0.1)", borderBottom: "1px solid rgba(16,185,129,0.2)" }}>
              <div>
                <span className="text-sm font-semibold text-emerald-300">✅ Organization Created — Save These Credentials</span>
                <p className="text-xs text-emerald-400/70 mt-0.5">
                  A welcome email was sent but may land in spam. Copy the credentials below now.
                </p>
              </div>
              <button onClick={() => setCreatedCreds(null)}><X size={14} className="text-emerald-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wider mb-1">
                {createdCreds.orgName} — Admin Login
              </div>
              {[
                { label: "Login URL", value: "https://atrail.in/login", key: "url" },
                { label: "Email",     value: createdCreds.email,         key: "email" },
                { label: "Password",  value: createdCreds.password,      key: "pass" },
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(16,185,129,0.1)" }}>
                  <div>
                    <div className="text-[10px] text-[#64748b] uppercase tracking-wider">{row.label}</div>
                    <div className="text-sm font-mono text-white mt-0.5">{row.value}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(row.value, row.key)}
                    className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                    style={{
                      background: copied === row.key ? "rgba(16,185,129,0.2)" : "rgba(0,212,255,0.08)",
                      border: `1px solid ${copied === row.key ? "rgba(16,185,129,0.4)" : "rgba(0,212,255,0.15)"}`,
                      color: copied === row.key ? "#34d399" : "#38bdf8",
                    }}>
                    {copied === row.key ? "Copied!" : "Copy"}
                  </button>
                </div>
              ))}
              <p className="text-xs text-[#64748b] pt-1">
                Share these with the admin and ask them to change their password on first login.
              </p>
            </div>
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <Card>
            <CardHeader
              title="Create New Organization"
              subtitle="Creates the org with feature flags enabled. Optionally add an admin user."
            />
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-5">
                {/* Org details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FIELD label="Organization Name" id="name" value={form.name} onChange={f("name")} placeholder="Acme Corp Ltd" />
                  {user?.role === "RESELLER_SUPER_ADMIN" ? (
                    <div>
                      <label htmlFor="orgType" className="block text-xs text-[#64748b] mb-1.5 font-medium">Type</label>
                      <input id="orgType" value="CLIENT" disabled
                        className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-[#64748b] focus:outline-none" />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="orgType" className="block text-xs text-[#64748b] mb-1.5 font-medium">Type<span className="text-red-400 ml-0.5">*</span></label>
                      <select id="orgType" value={form.orgType} onChange={f("orgType")} required
                        className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50">
                        <option value="CLIENT">CLIENT — paying customer</option>
                        <option value="INTERNAL">INTERNAL — our own org</option>
                        <option value="RESELLER">RESELLER — re-seller partner</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="planName" className="block text-xs text-[#64748b] mb-1.5 font-medium">Plan</label>
                    <select id="planName" value={form.planName} onChange={f("planName")}
                      className="w-full bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50">
                      <option>Starter</option>
                      <option>Growth</option>
                      <option>Enterprise</option>
                    </select>
                  </div>
                </div>

                {/* Admin user (collapsible) */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
                  <button type="button" onClick={() => setShowAdminSection((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#94a3b8] hover:text-white transition-colors"
                    style={{ background: "rgba(0,212,255,0.04)" }}>
                    <span>Admin User (optional — creates login credentials)</span>
                    {showAdminSection ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {showAdminSection && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                      <FIELD label="Admin Full Name" id="adminFullName" value={form.adminFullName} onChange={f("adminFullName")} placeholder="John Admin" required={false} />
                      <FIELD label="Admin Email" id="adminEmail" type="email" value={form.adminEmail} onChange={f("adminEmail")} placeholder="admin@acme.com" required={false} />
                      <FIELD label="Initial Password" id="adminPassword" type="password" value={form.adminPassword} onChange={f("adminPassword")} placeholder="min 6 chars" required={false} />
                    </div>
                  )}
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
                    style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)", color: "#020b18" }}>
                    {saving ? "Creating…" : "Create Organization"}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="px-6 py-2.5 rounded-xl text-sm font-medium text-[#64748b] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Type summary chips */}
        <div className="flex flex-wrap gap-3">
          {(["INTERNAL","RESELLER","CLIENT"] as const).map((t) => {
            const count = orgs.filter(o => o.orgType === t).length;
            return (
              <div key={t} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.1)", color: "#94a3b8" }}>
                <Badge tone={TYPE_TONE[t]}>{count}</Badge> {t}
              </div>
            );
          })}
          <span className="text-xs text-[#64748b] self-center ml-1">{orgs.length} total</span>
        </div>

        {/* Org list */}
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-center text-[#64748b] py-10 text-sm">
                {q ? `No organizations match "${q}".` : "No organizations yet."}
                {canCreate && !q && <span className="block mt-2">Click <strong>New Organization</strong> above to get started.</span>}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((org) => (
              <Card key={org.id} className="hover:border-primary/20 transition-colors">
                <CardContent>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.12),rgba(124,58,237,0.08))", border: "1px solid rgba(0,212,255,0.15)" }}>
                        <Building2 size={16} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{org.name}</div>
                        <div className="text-xs text-[#64748b] mt-0.5 flex items-center gap-2 flex-wrap">
                          {org.reseller && <span className="text-[#94a3b8]">via {org.reseller.name}</span>}
                          <span>{org.planName ?? "Starter"}</span>
                          <span>· {new Date(org.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      <Badge tone={TYPE_TONE[org.orgType]}>{org.orgType}</Badge>
                      <Badge tone={BILLING_TONE[org.billingStatus] ?? "amber"}>{org.billingStatus}</Badge>
                      {org._count && (
                        <>
                          <span className="flex items-center gap-1 text-xs text-[#64748b]"><Users size={11} /> {org._count.users}</span>
                          <span className="flex items-center gap-1 text-xs text-[#64748b]"><Briefcase size={11} /> {org._count.projects}</span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
