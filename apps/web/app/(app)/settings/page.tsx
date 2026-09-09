"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { setup2fa, verify2fa, disable2fa } from "@/lib/api-extensions";
import { useAuthStore } from "@/lib/auth-store";
import { authedFetch } from "@/lib/authed-fetch";
import { messaging, getToken } from "@/lib/firebase";
import { Shield, Bell, CheckCircle, AlertTriangle, Link as LinkIcon, Rocket } from "lucide-react";
import { API_BASE } from "@/lib/config";

type ConnectedAccount = {
  id: string;
  provider: "GOOGLE" | "MICROSOFT";
  email: string;
  createdAt: string;
};

export default function SettingsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const user  = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [qrCode,  setQrCode]  = useState<string | null>(null);
  const [secret,  setSecret]  = useState<string | null>(null);
  const [code,    setCode]    = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [msg,     setMsg]     = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [pushStatus, setPushStatus] = useState("");
  const [busy,    setBusy]    = useState(false);

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const twoFAEnabled = user?.twoFactorEnabled === true;

  const searchParams = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback result from URL params
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      showMsg(`${connected.charAt(0).toUpperCase() + connected.slice(1)} account connected successfully! 🎉`, 'success');
      loadAccounts();
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    } else if (error) {
      showMsg(`OAuth error: ${error.replace(/_/g, ' ')}`, 'error');
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await authedFetch<{ ok: boolean; accounts: ConnectedAccount[] }>("/integrations");
      if (res.ok) {
        setAccounts(res.accounts || []);
      }
    } catch (e) {
      console.error("Failed to load integrations", e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleConnectProvider = async (provider: "google" | "microsoft") => {
    try {
      setBusy(true);
      const res = await authedFetch<{ ok: boolean; url: string }>(`/integrations/${provider}/auth`);
      if (res.ok && res.url) {
        window.location.href = res.url;
      }
    } catch (e: any) {
      showMsg(e.message || `Failed to start ${provider} connection`, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this account? Calendar and email sync will stop.")) return;
    try {
      setBusy(true);
      await authedFetch(`/integrations/${id}`, { method: "DELETE" });
      setAccounts(accounts.filter(a => a.id !== id));
      showMsg("Account disconnected", "success");
    } catch (e: any) {
      showMsg(e.message || "Failed to disconnect", "error");
    } finally {
      setBusy(false);
    }
  };

  const showMsg = (text: string, type: "success" | "error" = "success") =>
    setMsg({ text, type });

  const handleSetup2FA = async () => {
    if (!token) return;
    setBusy(true); setMsg(null);
    try {
      const res = await setup2fa(token);
      if (res.ok) { setQrCode(res.qrCode); setSecret(res.secret); }
      else showMsg((res as any).message || "Setup failed.", "error");
    } catch (e: any) { showMsg(e.message, "error"); }
    finally { setBusy(false); }
  };

  const handleVerify2FA = async () => {
    if (!token || !user) return;
    if (!/^\d{6}$/.test(code.trim())) { showMsg("Enter a valid 6-digit code", "error"); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await verify2fa(token, code.trim());
      if (res.ok) {
        showMsg("2FA verified and enabled!", "success");
        // Mark enabled in store
        setAuth(token, { ...user, twoFactorEnabled: true });
        setQrCode(null); setSecret(null); setCode("");
      } else { showMsg(res.message || "Invalid code", "error"); }
    } catch (e: any) { showMsg(e.message, "error"); }
    finally { setBusy(false); }
  };

  const handleDisable2FA = async () => {
    if (!token || !user) return;
    if (!/^\d{6}$/.test(disableCode.trim())) {
      showMsg("Enter your current 6-digit 2FA code to confirm disable", "error");
      return;
    }
    if (!confirm("Are you sure you want to disable 2FA? This reduces your account security.")) return;
    setBusy(true); setMsg(null);
    try {
      // Send the TOTP code to the backend for re-auth
      const res = await fetch(`http://localhost:4000/api/v1/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: disableCode.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        showMsg("2FA disabled.", "success");
        setAuth(token, { ...user, twoFactorEnabled: false });
        setDisableCode("");
      } else { showMsg(data.message || "Could not disable 2FA", "error"); }
    } catch (e: any) { showMsg(e.message, "error"); }
    finally { setBusy(false); }
  };

  const handleEnablePush = async () => {
    if (!token || !messaging) {
      setPushStatus("Firebase messaging is not supported in this browser/environment.");
      return;
    }
    try {
      setBusy(true);
      setPushStatus("Requesting permission...");
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const fcmToken = await getToken(messaging);
        if (fcmToken) {
           const res = await fetch(`${API_BASE}/users/me/fcm`, {
             method: "PUT",
             headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
             body: JSON.stringify({ token: fcmToken })
           });
           if (res.ok) {
              setPushStatus("Push notifications enabled via Firebase!");
           } else {
              setPushStatus("Failed to setup notifications on backend.");
           }
        } else {
           setPushStatus("Failed to get FCM token.");
        }
      } else {
        setPushStatus("Permission denied for notifications.");
      }
    } catch (e: any) {
      console.error(e);
      setPushStatus("Push registration failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", borderRadius: "12px",
    border: "1.5px solid #cbd5e1", padding: "11px 16px",
    fontSize: "0.9rem", outline: "none", color: "#0f172a",
    background: "white", boxSizing: "border-box",
  };
  const btnPrimary: React.CSSProperties = {
    padding: "11px 22px", borderRadius: "12px", border: "none",
    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
    color: "white", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1, fontSize: "0.85rem",
    boxShadow: "0 4px 12px rgba(14,165,233,0.3)",
  };
  const btnDanger: React.CSSProperties = {
    ...btnPrimary,
    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
    boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
  };
  const sectionStyle: React.CSSProperties = {
    background: "white", border: "1px solid #e2eaf4",
    borderRadius: "20px", padding: "28px",
    boxShadow: "0 2px 16px rgba(14,165,233,0.06)",
  };

  return (
    <AppShell title="Account Settings" subtitle="Security and Preferences">
      <div className="max-w-[640px] mx-auto my-6 flex flex-col gap-6">

        {/* ── 2FA Section ── */}
        <section className="glass-panel border border-primary/20 rounded-2xl p-6 md:p-8 shadow-premium text-white relative overflow-hidden">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex-shrink-0"><Shield size={24} className="text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.5)]" /></span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Two-Factor Authentication
            </h2>
            <span className={`ml-auto text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider ${
              twoFAEnabled 
                ? "bg-emerald-950/60 border border-emerald-500/30 text-emerald-400" 
                : "bg-amber-950/60 border border-amber-500/30 text-amber-400"
            }`}>
              {twoFAEnabled ? "ENABLED" : "NOT SET UP"}
            </span>
          </div>
          <p className="text-text-muted text-sm mb-6 leading-relaxed">
            Protects your account with a time-based one-time password from Google Authenticator or Authy.
          </p>

          {msg && (
            <div className={`mb-6 p-4 rounded-xl text-sm border flex items-center gap-2 ${
              msg.type === "success" 
                ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-300" 
                : "bg-red-950/30 border-red-500/20 text-red-300"
            }`}>
              {msg.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              <span>{msg.text}</span>
            </div>
          )}

          {!twoFAEnabled && !qrCode && (
            <button 
              className="btn-premium px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-[#020b18] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(0,212,255,0.2)] hover:shadow-[0_6px_20px_rgba(0,212,255,0.35)] transition-all flex items-center gap-2"
              onClick={handleSetup2FA} 
              disabled={busy}
            >
              {busy ? "Setting up…" : <><Rocket size={16} /> Set Up 2FA</>}
            </button>
          )}

          {qrCode && (
            <div className="bg-[rgba(6,22,40,0.5)] border border-primary/10 rounded-xl p-5 mt-4 space-y-4">
              <p className="text-sm font-semibold text-white">
                1. Scan with Google Authenticator / Authy:
              </p>
              <div className="bg-white p-2 rounded-xl inline-block border border-primary/20 shadow-premium">
                <img src={qrCode} alt="2FA QR Code" className="w-[160px] h-[160px] block" />
              </div>
              <div className="bg-[rgba(0,212,255,0.04)] border border-primary/10 rounded-lg p-3 font-mono text-xs text-primary/90 word-break-all flex flex-col gap-1">
                <span className="text-text-muted text-[10px] uppercase font-sans tracking-wider font-semibold">Manual key:</span>
                <span>{secret}</span>
              </div>
              <p className="text-sm font-semibold text-white">
                2. Enter the 6-digit code to verify:
              </p>
              <div className="flex gap-3">
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="input-premium tracking-[0.25em] text-center font-bold text-lg max-w-[140px]"
                  onKeyDown={e => e.key === "Enter" && handleVerify2FA()}
                />
                <button 
                  className="btn-premium px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-[#020b18] font-bold cursor-pointer disabled:opacity-50 shadow-[0_4px_12px_rgba(0,212,255,0.2)] flex items-center gap-1.5"
                  onClick={handleVerify2FA} 
                  disabled={busy}
                >
                  {busy ? "…" : <>Verify <CheckCircle size={14} /></>}
                </button>
              </div>
            </div>
          )}

          {twoFAEnabled && (
            <div className="mt-6 p-5 bg-red-950/20 border border-red-500/20 rounded-xl space-y-4">
              <p className="flex items-center gap-2 text-sm text-red-400 font-semibold">
                <AlertTriangle size={16} /> Danger Zone — Enter your current 2FA code to disable:
              </p>
              <div className="flex gap-3">
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="input-premium tracking-[0.25em] text-center font-bold text-lg max-w-[140px] border-red-500/30 focus:border-red-500/60"
                />
                <button 
                  className="btn-premium px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-700 text-white font-bold cursor-pointer disabled:opacity-50 shadow-[0_4px_12px_rgba(239,68,68,0.25)] hover:shadow-[0_6px_20px_rgba(239,68,68,0.4)]"
                  onClick={handleDisable2FA} 
                  disabled={busy}
                >
                  {busy ? "…" : "Disable"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Push Notifications ── */}
        <section className="glass-panel border border-primary/20 rounded-2xl p-6 md:p-8 shadow-premium text-white relative overflow-hidden">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex-shrink-0"><Bell size={22} className="text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" /></span>
            <h2 className="text-lg font-bold text-white tracking-tight">Push Notifications</h2>
          </div>
          <p className="text-text-muted text-sm mb-6 leading-relaxed">
            Receive browser notifications for new messages, emergency events, and tasks.
          </p>
          <button 
            className="btn-premium px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-[#020b18] font-bold cursor-pointer shadow-[0_4px_12px_rgba(0,212,255,0.2)] hover:shadow-[0_6px_20px_rgba(0,212,255,0.35)] transition-all"
            onClick={handleEnablePush}
          >
            Enable Notification Delivery
          </button>
          {pushStatus && (
            <p className={`mt-4 p-4 rounded-xl text-sm border flex items-center gap-2 ${
              pushStatus.toLowerCase().includes("enabled") 
                ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-300" 
                : "bg-amber-950/30 border-amber-500/20 text-amber-300"
            }`}>
              {pushStatus.toLowerCase().includes("enabled") ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              <span>{pushStatus}</span>
            </p>
          )}
        </section>

        {/* ── Integrations ── */}
        <section className="glass-panel border border-primary/20 rounded-2xl p-6 md:p-8 shadow-premium text-white relative overflow-hidden">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex-shrink-0"><LinkIcon size={22} className="text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]" /></span>
            <h2 className="text-lg font-bold text-white tracking-tight">Connected Accounts</h2>
          </div>
          <p className="text-text-muted text-sm mb-6 leading-relaxed">
            Connect your Google Workspace or Microsoft 365 accounts to sync your calendars and emails.
          </p>

          <div className="flex flex-col gap-5">
            {loadingAccounts ? (
              <p className="text-sm text-text-muted italic">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-text-muted italic">No accounts connected yet.</p>
            ) : (
              <div className="space-y-3">
                {accounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between p-4 border border-primary/10 rounded-xl bg-[rgba(0,212,255,0.02)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(0,212,255,0.05)] hover:border-primary/25 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="px-2.5 py-1 bg-[rgba(0,212,255,0.1)] border border-primary/20 rounded text-xs font-bold text-primary tracking-wide">
                        {acc.provider}
                      </div>
                      <span className="text-sm font-semibold text-white/90">{acc.email}</span>
                    </div>
                    <button 
                      onClick={() => handleDisconnect(acc.id)}
                      disabled={busy}
                      className="text-xs text-red-400 hover:text-red-300 hover:underline transition-colors font-medium px-2 py-1 bg-red-950/20 border border-red-900/30 rounded-lg"
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button 
                className="btn-premium px-4 py-2.5 rounded-xl border border-primary/20 text-[#e2e8f0] bg-[rgba(0,212,255,0.04)] hover:bg-[rgba(0,212,255,0.08)] font-semibold transition hover:translate-y-[-1px] disabled:opacity-50"
                onClick={() => handleConnectProvider("google")} 
                disabled={busy}
              >
                Connect Google
              </button>
              <button 
                className="btn-premium px-4 py-2.5 rounded-xl border border-primary/20 text-[#e2e8f0] bg-[rgba(0,212,255,0.04)] hover:bg-[rgba(0,212,255,0.08)] font-semibold transition hover:translate-y-[-1px] disabled:opacity-50"
                onClick={() => handleConnectProvider("microsoft")} 
                disabled={busy}
              >
                Connect Microsoft
              </button>
            </div>

            <div className="mt-4 pt-6 border-t border-primary/10 space-y-3">
               <h3 className="text-base font-bold text-white tracking-tight">Notification Mirroring</h3>
               <p className="text-text-muted text-sm leading-relaxed">
                 Forward critical notifications and alerts directly to your connected Google or Microsoft accounts via Email.
               </p>
               <button 
                  className={`btn-premium px-5 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,212,255,0.2)] ${
                    (user as any)?.externalReminders 
                      ? "bg-emerald-900 border border-emerald-500/30 text-emerald-200" 
                      : "bg-gradient-to-r from-primary to-blue-600 text-[#020b18]"
                  }`}
                  onClick={async () => {
                     if (!token || !user) return;
                     setBusy(true);
                     const nextState = !((user as any).externalReminders);
                     try {
                        const res = await fetch(`${API_BASE}/users/me/external-reminders`, {
                          method: 'PUT',
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ enabled: nextState })
                       });
                       if (res.ok) {
                          setAuth(token, { ...user, externalReminders: nextState });
                       } else {
                          alert("Failed to update preferences.");
                       }
                     } catch(e) { console.error(e); }
                     setBusy(false);
                  }}
                  disabled={busy || accounts.length === 0}
               >
                  {accounts.length === 0 
                     ? "Connect an account to enable" 
                     : (user as any)?.externalReminders 
                        ? <><CheckCircle size={16} /> Mirroring Enabled (Disable)</> 
                        : "Enable Notification Mirroring"
                  }
               </button>
            </div>

          </div>
        </section>

      </div>
    </AppShell>
  );
}
