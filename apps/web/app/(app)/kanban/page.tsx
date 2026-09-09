"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { Loader2, GripVertical, Calendar, Flag, Plus, X, ChevronDown } from "lucide-react";

type TaskStatus   = "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED" | "REJECTED";
type TaskPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";

type KanbanTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  project: { id: string; name: string };
  assignedTo: { id: string; fullName: string };
};

type Project = { id: string; name: string };
type User    = { id: string; fullName: string; role: string };

const COLUMNS: { status: TaskStatus; label: string; color: string; bg: string }[] = [
  { status: "ASSIGNED",    label: "To Do",      color: "#64748b", bg: "rgba(100,116,139,0.08)" },
  { status: "IN_PROGRESS", label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.08)"  },
  { status: "SUBMITTED",   label: "In Review",   color: "#3B82F6", bg: "rgba(59,130,246,0.08)"  },
  { status: "ACCEPTED",    label: "Done",        color: "#22C55E", bg: "rgba(34,197,94,0.08)"   },
  { status: "REJECTED",    label: "Rejected",    color: "#EF4444", bg: "rgba(239,68,68,0.08)"   },
];

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  URGENT: "#EF4444", HIGH: "#F59E0B", NORMAL: "#64748b", LOW: "#22C55E",
};

const IS_ADMIN = (role?: string) =>
  ["GOD","DEVELOPER","RESELLER_SUPER_ADMIN","ADMIN","ELITE"].includes(role ?? "");

export default function KanbanPage() {
  const { user } = useAuthStore();
  const isAdmin = IS_ADMIN(user?.role);

  const [tasks,    setTasks]    = useState<KanbanTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over,     setOver]     = useState<TaskStatus | null>(null);

  // Filters
  const [projectFilter, setProjectFilter] = useState<string>("all");

  // Quick-create state
  const [addingTo, setAddingTo]   = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle]   = useState("");
  const [newDesc,  setNewDesc]    = useState("");
  const [newPrio,  setNewPrio]    = useState<TaskPriority>("NORMAL");
  const [newDue,   setNewDue]     = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newProject,  setNewProject]  = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    const endpoint = isAdmin ? "/tasks/all" : "/tasks/my";
    Promise.all([
      authedFetch<{ tasks: KanbanTask[] }>(endpoint),
      authedFetch<{ projects: Project[] }>("/projects"),
      isAdmin ? authedFetch<{ users: User[] }>("/users") : Promise.resolve({ users: [] as User[] }),
    ]).then(([taskRes, projRes, userRes]) => {
      if (taskRes.tasks) setTasks(taskRes.tasks);
      if (projRes.projects) setProjects(projRes.projects);
      if (userRes.users) setUsers(userRes.users);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (addingTo && inputRef.current) inputRef.current.focus();
  }, [addingTo]);

  const filtered = tasks.filter(t =>
    projectFilter === "all" || t.project?.id === projectFilter
  );

  const byStatus = (s: TaskStatus) => filtered.filter(t => t.status === s);

  async function moveTask(taskId: string, newStatus: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      const endpoint = isAdmin ? `/tasks/${taskId}/status` : `/tasks/${taskId}/my-status`;
      await authedFetch(endpoint, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    } catch {
      load();
    }
  }

  async function quickCreate() {
    if (!newTitle.trim() || !addingTo) return;
    setSaving(true);

    // Pick project: filter selection or first available
    const projectId = newProject || projects[0]?.id;
    if (!projectId) { setSaving(false); return; }

    // Pick assignee: selected user or self
    const assignedToId = newAssignee || user?.id;
    if (!assignedToId) { setSaving(false); return; }

    try {
      const res = await authedFetch<{ task: KanbanTask }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title:        newTitle.trim(),
          description:  newDesc.trim() || undefined,
          priority:     newPrio,
          dueAt:        newDue || undefined,
          status:       addingTo,
          projectId,
          assignedToId,
        }),
      });
      if (res.task) setTasks(prev => [...prev, res.task]);
    } catch {}

    setNewTitle(""); setNewDesc(""); setNewPrio("NORMAL");
    setNewDue(""); setNewAssignee(""); setNewProject("");
    setAddingTo(null);
    setSaving(false);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDragging(id);
    e.dataTransfer.setData("taskId", id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent, s: TaskStatus) {
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(s);
  }
  function onDrop(e: React.DragEvent, s: TaskStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData("taskId");
    if (id) moveTask(id, s);
    setDragging(null); setOver(null);
  }
  function onDragEnd() { setDragging(null); setOver(null); }

  const isOverdue = (t: KanbanTask) =>
    t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "ACCEPTED";

  const INPUT = "w-full bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#374151] focus:outline-none focus:border-primary/50";

  return (
    <AppShell
      title="Kanban Board"
      subtitle="Drag tasks between columns · Click + to create a task in any column"
      right={
        <div className="flex items-center gap-2">
          {/* Project filter */}
          <div className="relative">
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="appearance-none bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] rounded-xl px-3 py-1.5 text-xs text-white pr-7 focus:outline-none"
            >
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
          </div>
          <button onClick={load}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#64748b] border border-[rgba(0,212,255,0.1)] hover:text-primary transition-colors">
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 mt-4 min-h-[75vh]" style={{ scrollbarWidth: "thin" }}>
          {COLUMNS.map(col => {
            const colTasks   = byStatus(col.status);
            const isDrop     = over === col.status;
            const isAdding   = addingTo === col.status;

            return (
              <div
                key={col.status}
                className="flex-shrink-0 w-72 flex flex-col rounded-2xl transition-all duration-200"
                style={{
                  background: isDrop ? col.bg : "rgba(6,22,40,0.5)",
                  border: `1px solid ${isDrop ? col.color + "55" : "rgba(0,212,255,0.06)"}`,
                  boxShadow: isDrop ? `0 0 24px ${col.color}22` : "none",
                }}
                onDragOver={e => onDragOver(e, col.status)}
                onDrop={e => onDrop(e, col.status)}
                onDragLeave={() => setOver(null)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(0,212,255,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                    <span className="text-sm font-semibold text-white">{col.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: col.color + "22", color: col.color }}>
                      {colTasks.length}
                    </span>
                    {/* + Add task button */}
                    <button
                      onClick={() => setAddingTo(isAdding ? null : col.status)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                      style={{
                        background: isAdding ? "rgba(239,68,68,0.15)" : "rgba(0,212,255,0.1)",
                        border: `1px solid ${isAdding ? "rgba(239,68,68,0.3)" : "rgba(0,212,255,0.2)"}`,
                        color: isAdding ? "#f87171" : "#00d4ff",
                      }}
                      title={isAdding ? "Cancel" : "Add task here"}
                    >
                      {isAdding ? <X size={11} /> : <Plus size={11} />}
                    </button>
                  </div>
                </div>

                {/* Quick-create form */}
                {isAdding && (
                  <div className="p-3 border-b space-y-2" style={{ borderColor: "rgba(0,212,255,0.06)", background: "rgba(0,212,255,0.03)" }}>
                    <input
                      ref={inputRef}
                      className={INPUT}
                      placeholder="Task title *"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && quickCreate()}
                    />
                    <input
                      className={INPUT}
                      placeholder="Description (optional)"
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select className={INPUT} value={newPrio} onChange={e => setNewPrio(e.target.value as TaskPriority)}>
                        <option value="LOW">🟢 Low</option>
                        <option value="NORMAL">⚪ Normal</option>
                        <option value="HIGH">🟠 High</option>
                        <option value="URGENT">🔴 Urgent</option>
                      </select>
                      <input type="date" className={INPUT} value={newDue} onChange={e => setNewDue(e.target.value)} />
                    </div>
                    {/* Project selector */}
                    <select className={INPUT} value={newProject} onChange={e => setNewProject(e.target.value)}>
                      <option value="">-- Project --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {/* Assignee (admin only) */}
                    {isAdmin && (
                      <select className={INPUT} value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                        <option value="">-- Assign to me --</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                      </select>
                    )}
                    <button
                      onClick={quickCreate}
                      disabled={saving || !newTitle.trim()}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-all"
                      style={{ background: "linear-gradient(135deg,#00d4ff,#0284c7)", color: "#020b18" }}
                    >
                      {saving ? "Creating…" : "Create Task"}
                    </button>
                  </div>
                )}

                {/* Cards */}
                <div className="flex flex-col gap-3 p-3 flex-1 min-h-[120px]">
                  {colTasks.length === 0 && !isAdding && (
                    <div
                      className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-text-muted border border-dashed rounded-xl cursor-pointer hover:border-opacity-70 transition-colors"
                      style={{ borderColor: col.color + "33", minHeight: 80 }}
                      onClick={() => setAddingTo(col.status)}
                    >
                      <Plus size={16} style={{ color: col.color, opacity: 0.5 }} />
                      <span>Drop here or click to add</span>
                    </div>
                  )}
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                      className="rounded-xl p-3 cursor-grab active:cursor-grabbing select-none group transition-all duration-150"
                      style={{
                        background: dragging === task.id ? "rgba(0,212,255,0.05)" : "rgba(10,25,47,0.8)",
                        border: "1px solid rgba(0,212,255,0.08)",
                        opacity: dragging === task.id ? 0.4 : 1,
                        boxShadow: dragging === task.id ? "none" : "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    >
                      {isOverdue(task) && (
                        <div className="text-[10px] font-bold text-red-400 mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          OVERDUE
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-[#334155] flex-shrink-0 mt-0.5 group-hover:text-[#64748b] transition-colors" />
                        <p className="text-sm font-medium text-white leading-snug">{task.title}</p>
                      </div>
                      <div className="mt-2 text-[11px] text-text-muted truncate pl-5">
                        📁 {task.project?.name ?? "—"}
                      </div>
                      <div className="flex items-center justify-between mt-3 pl-5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: PRIORITY_COLOR[task.priority] }}>
                          <Flag size={10} />
                          {{ URGENT:"🔴 Urgent", HIGH:"🟠 High", NORMAL:"⚪ Normal", LOW:"🟢 Low" }[task.priority]}
                        </div>
                        {task.dueAt && (
                          <div className="flex items-center gap-1 text-[10px] text-text-muted">
                            <Calendar size={10} />
                            {new Date(task.dueAt).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 pl-5">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]"
                          style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.1)" }}>
                          <div className="w-3.5 h-3.5 rounded-full bg-primary/30 flex items-center justify-center text-[8px] text-primary font-bold">
                            {task.assignedTo?.fullName?.charAt(0) ?? "?"}
                          </div>
                          <span className="text-text-muted">{task.assignedTo?.fullName?.split(" ")[0] ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
