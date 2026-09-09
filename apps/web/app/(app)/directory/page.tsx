"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";

type DirectoryUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
  companyName: string | null;
  status: string;
  organizationId: string;
  reportsTo: { id: string; fullName: string; role: string } | null;
  accessibleOrgs?: { organizationId: string; organization: { id: string; name: string } }[];
};

type DirectoryData = {
  users: DirectoryUser[];
  grouped: Record<string, DirectoryUser[]>;
};

export default function DirectoryPage() {
  const [data, setData] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState<{ open: boolean; targetUser: DirectoryUser | null }>({
    open: false,
    targetUser: null,
  });
  const [selectedManager, setSelectedManager] = useState("");

  const [roleModal, setRoleModal] = useState<{ open: boolean; targetUser: DirectoryUser | null }>({
    open: false,
    targetUser: null,
  });
  const [selectedRole, setSelectedRole] = useState("");

  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [editModal, setEditModal] = useState<{ open: boolean; targetUser: DirectoryUser | null }>({
    open: false,
    targetUser: null,
  });
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "",
    organizationId: "",
    accessibleOrgIds: [] as string[],
  });

  const me = useAuthStore((s) => s.user);

  const load = async () => {
    try {
      const res = await authedFetch<{ ok: true; users: DirectoryUser[]; grouped: Record<string, DirectoryUser[]> }>(
        "/users/directory"
      );
      setData(res);

      if (me?.role === "ADMIN" || me?.role === "RESELLER_SUPER_ADMIN" || me?.role === "GOD" || me?.role === "DEVELOPER") {
        const orgRes = await authedFetch<{ ok: true; organizations: { id: string; name: string }[] }>("/organizations");
        if (orgRes.organizations) {
          setOrgs(orgRes.organizations);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [me]);

  const handleAssign = async () => {
    if (!assignModal.targetUser || !selectedManager) return;
    try {
      await authedFetch(`/users/${assignModal.targetUser.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ reportsToId: selectedManager }),
      });
      setAssignModal({ open: false, targetUser: null });
      setSelectedManager("");
      load(); // Reload directory
    } catch (e: any) {
      alert(e.message || "Failed to assign manager. Please check permissions.");
    }
  };

  const handleChangeRole = async () => {
    if (!roleModal.targetUser || !selectedRole) return;
    try {
      await authedFetch(`/users/${roleModal.targetUser.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: selectedRole }),
      });
      setRoleModal({ open: false, targetUser: null });
      setSelectedRole("");
      load(); // Reload directory
    } catch (e: any) {
      alert(e.message || "Failed to change role. Please check permissions.");
    }
  };

  const [createUserModal, setCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: "", email: "", password: "", role: "USER", organizationId: "" });

  const handleCreateUser = async () => {
    try {
      await authedFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          ...newUser,
          organizationId: newUser.organizationId || me?.organizationId,
        }),
      });
      setCreateUserModal(false);
      setNewUser({ fullName: "", email: "", password: "", role: "USER", organizationId: "" });
      load();
    } catch (e: any) {
      alert(e.message || "Failed to create user.");
    }
  };

  const handleEditOpen = (u: DirectoryUser) => {
    setEditModal({ open: true, targetUser: u });
    setEditForm({
      fullName: u.fullName,
      email: u.email,
      password: "",
      role: u.role,
      organizationId: u.organizationId || "",
      accessibleOrgIds: u.accessibleOrgs?.map((ao) => ao.organizationId) || [],
    });
  };

  const handleUpdateUser = async () => {
    if (!editModal.targetUser) return;
    try {
      await authedFetch(`/users/${editModal.targetUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email,
          ...(editForm.password && { password: editForm.password }),
          role: editForm.role,
          organizationId: editForm.organizationId,
          accessibleOrgIds: editForm.accessibleOrgIds,
        }),
      });
      setEditModal({ open: false, targetUser: null });
      load();
    } catch (e: any) {
      alert(e.message || "Failed to update user.");
    }
  };

  const handleDeleteUser = async () => {
    if (!editModal.targetUser) return;
    if (!confirm("Are you sure you want to deactivate/delete this user?")) return;
    try {
      await authedFetch(`/users/${editModal.targetUser.id}`, {
        method: "DELETE",
      });
      setEditModal({ open: false, targetUser: null });
      load();
    } catch (e: any) {
      alert(e.message || "Failed to delete user.");
    }
  };

  const toggleAccessibleOrg = (orgId: string) => {
    setEditForm((prev) => {
      const current = prev.accessibleOrgIds;
      const next = current.includes(orgId)
        ? current.filter((id) => id !== orgId)
        : [...current, orgId];
      return { ...prev, accessibleOrgIds: next };
    });
  };

  // Get valid managers based on the target user's role
  const getValidManagers = (targetRole: string) => {
    if (!data) return [];
    if (targetRole === "ELITE") {
      // Elites report to Admins or Super Admins
      return [...(data.grouped["ADMIN"] || []), ...(data.grouped["RESELLER_SUPER_ADMIN"] || [])];
    }
    if (targetRole === "USER") {
      // Interns/Users report to Elites
      return data.grouped["ELITE"] || [];
    }
    return [];
  };

  const canEditUser = (target: DirectoryUser) => {
    if (!me) return false;
    const isDeveloperOrGod = me.role === "GOD" || me.role === "DEVELOPER" || me.role === "RESELLER_SUPER_ADMIN";
    if (isDeveloperOrGod) return true;
    if (me.role === "ADMIN") {
      const isLowerRole = target.role === "ELITE" || target.role === "USER" || target.role === "INTERN";
      const isSameOrg = target.organizationId === me.organizationId;
      return isLowerRole && isSameOrg;
    }
    return false;
  };

  return (
    <AppShell 
      title="Organization Directory" 
      subtitle="Manage teams and reporting structures"
      right={
        (["GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN", "ADMIN"].includes(me?.role ?? "")) && (
          <Button onClick={() => setCreateUserModal(true)}>+ Create User</Button>
        )
      }
    >
      <div className="space-y-6">
        {loading ? (
          <div className="text-text-muted">Loading directory...</div>
        ) : !data ? (
          <div className="text-red-400">Failed to load directory.</div>
        ) : (
          ["GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN", "ADMIN", "ELITE", "USER", "INTERN"].map((roleKey) => {
            const roleUsers = data.grouped[roleKey] || [];
            if (roleUsers.length === 0) return null;

            return (
              <Card key={roleKey} className="border-primary/20">
                <CardHeader title={roleKey === 'RESELLER_SUPER_ADMIN' ? 'Reseller Admin' : roleKey === 'GOD' ? 'Platform Owner' : roleKey.replace(/_/g, ' ')} subtitle={`${roleUsers.length} members`} />
                <CardContent>
                  <div className="divide-y divide-zinc-800">
                    {roleUsers.map((u) => (
                      <div key={u.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="text-white font-medium flex items-center gap-2">
                            {u.fullName}
                            {u.status === "PENDING" && <Badge tone="amber">Pending</Badge>}
                          </p>
                          <p className="text-sm text-text-muted">{u.email} {u.phone && `• ${u.phone}`}</p>
                          {u.reportsTo && (
                            <p className="text-xs text-primary mt-1">
                              Reports To: {u.reportsTo.fullName} ({u.reportsTo.role})
                            </p>
                          )}
                          {u.accessibleOrgs && u.accessibleOrgs.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                              <span className="text-[10px] text-text-muted mr-1 font-semibold uppercase tracking-wider">Accessible Orgs:</span>
                              {u.accessibleOrgs.map((ao) => (
                                <Badge key={ao.organizationId} tone="blue" className="text-[10px] py-0 px-1.5">
                                  {ao.organization.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {canEditUser(u) && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => handleEditOpen(u)}
                              className="text-xs"
                            >
                              Edit User
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Modal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, targetUser: null })}
        title={`Edit User: ${editModal.targetUser?.fullName}`}
        footer={
          <div className="flex justify-between items-center w-full">
            <div>
              {(me?.role === "RESELLER_SUPER_ADMIN" || me?.role === "GOD" || me?.role === "DEVELOPER") && (
                <Button variant="danger" onClick={handleDeleteUser}>
                  Delete User
                </Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditModal({ open: false, targetUser: null })}>
                Cancel
              </Button>
              <Button onClick={handleUpdateUser} disabled={!editForm.fullName || !editForm.email}>
                Save Changes
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Full Name</label>
            <input
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              placeholder="Full Name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Email</label>
            <input
              type="email"
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
              New Password (leave blank if not changing)
            </label>
            <input
              type="password"
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              placeholder="Password"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Role</label>
            <select
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            >
              <option value="INTERN">Intern</option>
              <option value="USER">User</option>
              <option value="USER">User</option>
              <option value="ELITE">Elite / Team Lead</option>
              {me?.role === "RESELLER_SUPER_ADMIN" && <option value="ADMIN">Admin</option>}
              {me?.role === "RESELLER_SUPER_ADMIN" && <option value="RESELLER_SUPER_ADMIN">Super Admin</option>}
            </select>
          </div>

          {(me?.role === "RESELLER_SUPER_ADMIN" || me?.role === "GOD" || me?.role === "DEVELOPER") && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Primary Organization</label>
                <select
                  className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
                  value={editForm.organizationId}
                  onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value })}
                >
                  <option value="" disabled>-- Select Organization --</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Accessible Organizations</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-3 glass-panel border border-primary/20 rounded-lg">
                  {orgs.map((o) => {
                    const isChecked = editForm.accessibleOrgIds.includes(o.id);
                    return (
                      <label key={o.id} className="flex items-center gap-2 text-sm text-[#e2e8f0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAccessibleOrg(o.id)}
                          className="rounded border-primary/20 text-primary focus:ring-primary/40 bg-[#020b18]"
                        />
                        {o.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={assignModal.open}
        onClose={() => setAssignModal({ open: false, targetUser: null })}
        title={`Assign Manager to ${assignModal.targetUser?.fullName}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setAssignModal({ open: false, targetUser: null })}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedManager}>
              Confirm Assignment
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Select the new reporting manager for this user. The chat boundaries and project access will be securely updated.
          </p>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">
              Select Manager
            </label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="w-full glass-panel border border-primary/20 rounded-lg px-3 py-2 text-white outline-none focus:border-primary"
            >
              <option value="" disabled>-- Choose a manager --</option>
              {assignModal.targetUser &&
                getValidManagers(assignModal.targetUser.role).map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName} ({manager.role})
                  </option>
                ))}
            </select>
            {assignModal.targetUser && getValidManagers(assignModal.targetUser.role).length === 0 && (
              <p className="text-xs text-red-400 mt-2">No valid managers exist for this role level.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={roleModal.open}
        onClose={() => setRoleModal({ open: false, targetUser: null })}
        title={`Change Role for ${roleModal.targetUser?.fullName}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setRoleModal({ open: false, targetUser: null })}>
              Cancel
            </Button>
            <Button onClick={handleChangeRole} disabled={!selectedRole || selectedRole === roleModal.targetUser?.role}>
              Confirm Change
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Select the new role for this user. This affects their system permissions and module access.
          </p>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">
              Select Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full glass-panel border border-primary/20 rounded-lg px-3 py-2 text-white outline-none focus:border-primary"
            >
              <option value="" disabled>-- Choose a role --</option>
              <option value="INTERN">Intern</option>
              <option value="USER">User</option>
              <option value="USER">User</option>
              <option value="ELITE">Elite / Team Lead</option>
              {me?.role === "RESELLER_SUPER_ADMIN" && <option value="ADMIN">Admin</option>}
              {me?.role === "RESELLER_SUPER_ADMIN" && <option value="RESELLER_SUPER_ADMIN">Super Admin</option>}
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        open={createUserModal}
        onClose={() => setCreateUserModal(false)}
        title="Create New User"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setCreateUserModal(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={!newUser.fullName || !newUser.email || !newUser.password}>Create</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Add a new operative. Only Admins can perform this action.</p>
          
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Full Name</label>
            <input 
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={newUser.fullName} onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Email</label>
            <input 
              type="email"
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              placeholder="john@atrail.org.in"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Temporary Password</label>
            <input 
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})}
              placeholder="ChangeMe@123"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Role</label>
            <select
              className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
              value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}
            >
              <option value="INTERN">Intern</option>
              <option value="USER">User</option>
              <option value="ELITE">Elite / Team Lead</option>
              {(["GOD","DEVELOPER","RESELLER_SUPER_ADMIN","ADMIN"].includes(me?.role ?? "")) && <option value="ADMIN">Admin</option>}
              {(["GOD","DEVELOPER"].includes(me?.role ?? "")) && <option value="RESELLER_SUPER_ADMIN">Reseller Admin</option>}
            </select>
          </div>
          {(["GOD","DEVELOPER","RESELLER_SUPER_ADMIN"].includes(me?.role ?? "")) && (
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Organization</label>
              <select
                className="w-full glass-panel border border-primary/20 rounded-lg px-4 py-2 text-white outline-none focus:border-primary"
                value={newUser.organizationId}
                onChange={(e) => setNewUser({ ...newUser, organizationId: e.target.value })}
              >
                <option value="">-- Current Organization --</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
