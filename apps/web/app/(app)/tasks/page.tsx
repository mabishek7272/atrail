"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "@/components/ui/toast";
import {
  Plus, Search, RefreshCw, User, Calendar,
  MessageSquare, Paperclip, CheckCircle, XCircle, Clock,
  Send, Eye, Users, X, Loader2, AlertCircle, Trash2, FolderKanban,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type TaskStatus   = "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED" | "REJECTED";
type TaskPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";

interface TaskUser   { id: string; fullName: string; role: string }
interface Project    { id: string; name: string }
interface Submission {
  id: string; status: "PENDING"|"ACCEPTED"|"REJECTED"; createdAt: string;
  notes: string|null; reviewComment: string|null; reviewedAt: string|null;
  proofs: { id: string; fileUrl: string; fileName: string; mimeType: string }[];
}
interface Comment {
  id: string; content: string; createdAt: string;
  author: { id: string; fullName: string };
}
interface Task {
  id: string; title: string; description: string|null;
  status: TaskStatus; priority: TaskPriority;
  dueAt: string|null; createdAt: string;
  project: Project;
  assignedTo: TaskUser;
  assignedBy: TaskUser;
  submissions: Submission[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<TaskPriority, string> = {
  URGENT: "bg-red-900/40 text-red-400 border-red-800/50",
  HIGH:   "bg-orange-900/40 text-orange-400 border-orange-800/50",
  NORMAL: "bg-blue-900/30 text-blue-400 border-blue-800/30",
  LOW:    "bg-gray-800 text-gray-400 border-gray-700",
};

const STATUS_STYLE: Record<TaskStatus, { bg: string; text: string; label: string }> = {
  ASSIGNED:    { bg: "bg-gray-800",       text: "text-gray-300",   label: "To Do"       },
  IN_PROGRESS: { bg: "bg-amber-900/40",   text: "text-amber-400",  label: "In Progress" },
  SUBMITTED:   { bg: "bg-blue-900/40",    text: "text-blue-400",   label: "In Review"   },
  ACCEPTED:    { bg: "bg-green-900/40",   text: "text-green-400",  label: "Done"        },
  REJECTED:    { bg: "bg-red-900/40",     text: "text-red-400",    label: "Rework"      },
};

const ADMIN_ROLES = new Set(["GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN", "ADMIN", "ELITE"]);
const IN = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500";
const SEL = "w-full px-3 py-2 bg-[rgba(6,22,40,0.9)] border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-blue-500";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const { user } = useAuthStore();
  const isAdmin = ADMIN_ROLES.has(user?.role ?? "");

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState<"my" | "all" | "project">("my");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [deleting, setDeleting] = useState(false);

  // filters
  const [search,   setSearch]   = useState("");
  const [statusF,  setStatusF]  = useState<TaskStatus | "">("");
  const [priorityF,setPriorityF]= useState<TaskPriority | "">("");

  // create task form
  const [showCreate, setShowCreate] = useState(false);
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [orgUsers,   setOrgUsers]   = useState<TaskUser[]>([]);
  const [createForm, setCreateForm] = useState({
    title: "", description: "", projectId: "", assignedToId: "",
    priority: "NORMAL" as TaskPriority, dueAt: "",
  });
  const [creating, setCreating] = useState(false);

  const [projectMembers, setProjectMembers] = useState<TaskUser[]>([]);


  // review
  const [reviewing,    setReviewing]    = useState<string | null>(null);
  const [reviewComment,setReviewComment]= useState("");

  // comment
  const [newComment,  setNewComment]   = useState("");
  const [sendingComment,setSendingComment] = useState(false);

  // submit task (for assignee)
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load tasks ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      let endpoint = "/tasks/my";
      if (view === "all" && isAdmin) endpoint = "/tasks/all";
      else if (view === "project" && selectedProjectId) endpoint = `/tasks/project/${selectedProjectId}`;
      const r = await authedFetch<{ ok: boolean; tasks: Task[] }>(endpoint);
      if (r.ok) setTasks(r.tasks);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [view, selectedProjectId]);

  // ── Delete task ──────────────────────────────────────────────────────────
  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this task permanently?")) return;
    setDeleting(true);
    try {
      await authedFetch(`/tasks/${taskId}`, { method: "DELETE" });
      toast.success("Task deleted");
      setSelected(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete task");
    } finally { setDeleting(false); }
  };

  // ── Load detail + comments ──────────────────────────────────────────────
  const selectTask = async (t: Task) => {
    setSelected(t);
    setComments([]);
    try {
      const taskRes = await authedFetch<{ ok: boolean; task: Task }>(`/tasks/${t.id}`);
      if (taskRes.ok) setSelected(taskRes.task);
    } catch (e) {
      console.error(e);
    }
    const r = await authedFetch<{ ok: boolean; comments: Comment[] }>(`/tasks/${t.id}/comments`);
    if (r.ok) setComments(r.comments);
  };

  // ── Load projects on mount (needed for Project Tasks tab) ───────────────
  useEffect(() => {
    authedFetch<{ ok: boolean; projects: Project[] }>("/projects").then(pr => {
      if (pr.ok) setProjects(pr.projects ?? []);
    });
  }, []);

  // ── Load users when create form opens ───────────────────────────────────
  useEffect(() => {
    if (!showCreate) return;
    authedFetch<{ ok: boolean; users: TaskUser[] }>("/users").then(us => {
      if (us.ok) setOrgUsers(us.users ?? []);
    });
  }, [showCreate]);

  // Load project members when project changes
  useEffect(() => {
    if (!createForm.projectId) {
      setProjectMembers([]);
      return;
    }
    authedFetch<{ ok: boolean; members: { user: TaskUser }[] }>(`/projects/${createForm.projectId}/members`).then(res => {
      if (res.ok && res.members) {
        setProjectMembers(res.members.map(m => m.user));
      }
    });
  }, [createForm.projectId]);

  // ── Create task ─────────────────────────────────────────────────────────
  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title || !createForm.projectId || !createForm.assignedToId) {
      toast.error("Title, project and assignee are required"); return;
    }
    setCreating(true);
    try {
      const r = await authedFetch<{ ok: boolean; task: Task }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          dueAt: createForm.dueAt ? new Date(createForm.dueAt).toISOString() : undefined,
        }),
      });
      if (r.ok) {
        toast.success("Task created and assigned!");
        setShowCreate(false);
        setCreateForm({ title: "", description: "", projectId: "", assignedToId: "", priority: "NORMAL", dueAt: "" });
        load();
      }
    } catch { toast.error("Failed to create task"); }
    finally { setCreating(false); }
  };

  // ── Submit task (assignee) ───────────────────────────────────────────────
  const submitTask = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("notes", submitNote);
      const files = fileRef.current?.files;
      if (files) Array.from(files).forEach(f => fd.append("files", f));
      const r = await authedFetch<{ ok: boolean }>(`/tasks/${selected.id}/submit`, {
        method: "POST", body: fd,
      });
      if (r.ok) {
        toast.success("Submitted for review!");
        setSubmitNote(""); if (fileRef.current) fileRef.current.value = "";
        load(); setSelected(null);
      }
    } catch { toast.error("Submit failed"); }
    finally { setSubmitting(false); }
  };

  // ── Update my status ─────────────────────────────────────────────────────
  const updateStatus = async (taskId: string, status: "ASSIGNED"|"IN_PROGRESS"|"SUBMITTED") => {
    await authedFetch(`/tasks/${taskId}/my-status`, {
      method: "PATCH", body: JSON.stringify({ status }),
    });
    load();
    if (selected?.id === taskId) setSelected(prev => prev ? { ...prev, status } : null);
  };

  // ── Review submission ─────────────────────────────────────────────────────
  const review = async (submissionId: string, decision: "ACCEPT"|"REJECT") => {
    setReviewing(submissionId);
    try {
      await authedFetch(`/tasks/submissions/${submissionId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: reviewComment }),
      });
      toast.success(decision === "ACCEPT" ? "Task accepted!" : "Sent back for rework");
      setReviewComment(""); load();
      setSelected(null);
    } finally { setReviewing(null); }
  };

  // ── Post comment ──────────────────────────────────────────────────────────
  const postComment = async () => {
    if (!selected || !newComment.trim()) return;
    setSendingComment(true);
    try {
      const r = await authedFetch<{ ok: boolean; comment: Comment }>(`/tasks/${selected.id}/comments`, {
        method: "POST", body: JSON.stringify({ content: newComment }),
      });
      if (r.ok) { setComments(p => [...p, r.comment]); setNewComment(""); }
    } finally { setSendingComment(false); }
  };

  // ── Filtered tasks ────────────────────────────────────────────────────────
  const filtered = tasks.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.project.name.toLowerCase().includes(q) || t.assignedTo.fullName.toLowerCase().includes(q);
    const matchS = !statusF   || t.status   === statusF;
    const matchP = !priorityF || t.priority === priorityF;
    return matchQ && matchS && matchP;
  });

  const isAssignee  = selected && selected.assignedTo.id === user?.id;
  const canReview   = isAdmin;
  const pendingSub  = selected?.submissions.find(s => s.status === "PENDING");

  return (
    <AppShell title="Tasks" subtitle="Assign, track and complete work">
      <div className="flex flex-col h-full">

        {/* ── Top Bar ── */}
        <div className="flex items-center gap-3 p-4 border-b border-white/5 flex-wrap">
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
            <button onClick={() => setView("my")}
              className={`px-4 py-2 font-semibold transition-colors ${view === "my" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
              My Tasks
            </button>
            {isAdmin && (
              <button onClick={() => setView("all")}
                className={`px-4 py-2 font-semibold transition-colors ${view === "all" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
                All Tasks
              </button>
            )}
            <button onClick={() => setView("project")}
              className={`px-4 py-2 font-semibold transition-colors flex items-center gap-1 ${view === "project" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
              <FolderKanban className="w-3 h-3" /> Project Tasks
            </button>
          </div>
          {view === "project" && (
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-200 text-xs focus:outline-none focus:border-blue-500 min-w-[160px]">
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>

          <select value={statusF} onChange={e => setStatusF(e.target.value as any)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 text-xs focus:outline-none">
            <option value="">All Status</option>
            {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={priorityF} onChange={e => setPriorityF(e.target.value as any)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 text-xs focus:outline-none">
            <option value="">All Priority</option>
            {(["URGENT","HIGH","NORMAL","LOW"] as const).map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <button onClick={load} className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <RefreshCw className="w-4 h-4" />
          </button>

          {isAdmin && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Assign Task
            </button>
          )}
        </div>

        {/* ── Split Panel ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: Task List */}
          <div className="w-[380px] flex-shrink-0 border-r border-white/5 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <CheckCircle className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">No tasks found</p>
                {isAdmin && <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-400 text-sm hover:underline">+ Assign a task</button>}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map(t => {
                  const ss = STATUS_STYLE[t.status];
                  const ps = PRIORITY_STYLE[t.priority];
                  const daysLeft = t.dueAt ? Math.ceil((new Date(t.dueAt).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <button key={t.id} onClick={() => selectTask(t)}
                      className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${selected?.id === t.id ? "bg-white/8 border-l-2 border-blue-500" : ""}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-white text-sm font-medium leading-snug line-clamp-2">{t.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${ps}`}>{t.priority}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ss.bg} ${ss.text}`}>{ss.label}</span>
                        <span className="text-[10px] text-gray-500">{t.project.name}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          <User className="w-3 h-3" />
                          {view === "all" ? t.assignedTo.fullName : t.assignedBy.fullName}
                        </div>
                        {daysLeft !== null && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${daysLeft < 0 ? "text-red-400" : daysLeft <= 2 ? "text-orange-400" : "text-gray-500"}`}>
                            <Calendar className="w-3 h-3" />
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Task Detail */}
          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <Eye className="w-12 h-12 text-gray-700 mb-3" />
                <p className="text-gray-400">Select a task to view details</p>
              </div>
            ) : (
              <div className="p-6 max-w-2xl">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-white leading-snug">{selected.title}</h2>
                    <p className="text-gray-400 text-sm mt-1">{selected.project.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${PRIORITY_STYLE[selected.priority]}`}>{selected.priority}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLE[selected.status].bg} ${STATUS_STYLE[selected.status].text}`}>{STATUS_STYLE[selected.status].label}</span>
                    {isAdmin && (
                      <button onClick={() => deleteTask(selected.id)} disabled={deleting}
                        className="p-1.5 rounded-lg bg-red-900/30 hover:bg-red-800/50 border border-red-800/40 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        title="Delete task">
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { label: "Assigned To", val: selected.assignedTo.fullName, icon: <User className="w-3.5 h-3.5" /> },
                    { label: "Assigned By", val: selected.assignedBy.fullName, icon: <Users className="w-3.5 h-3.5" /> },
                    { label: "Due Date", val: selected.dueAt ? new Date(selected.dueAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "No deadline", icon: <Calendar className="w-3.5 h-3.5" /> },
                    { label: "Created", val: new Date(selected.createdAt).toLocaleDateString("en-IN"), icon: <Clock className="w-3.5 h-3.5" /> },
                  ].map(m => (
                    <div key={m.label} className="bg-white/5 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">{m.icon}{m.label}</div>
                      <p className="text-white text-sm font-medium">{m.val}</p>
                    </div>
                  ))}
                </div>

                {selected.description && (
                  <div className="mb-5 p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Description</p>
                    <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{selected.description}</p>
                  </div>
                )}

                {/* Assignee actions */}
                {isAssignee && selected.status === "ASSIGNED" && (
                  <button onClick={() => updateStatus(selected.id, "IN_PROGRESS")}
                    className="w-full py-2.5 mb-4 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" /> Start Working
                  </button>
                )}

                {isAssignee && (selected.status === "IN_PROGRESS" || selected.status === "REJECTED") && (
                  <div className="mb-5 p-4 bg-white/5 rounded-xl border border-white/8 space-y-3">
                    <p className="text-white font-semibold text-sm">Submit for Review</p>
                    <textarea value={submitNote} onChange={e => setSubmitNote(e.target.value)}
                      placeholder="Add notes about your work (optional)..."
                      rows={3} className={`${IN} resize-none`} />
                    <div>
                      <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Attach Files (optional)</label>
                      <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx"
                        className="text-gray-400 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-900/40 file:text-blue-300 file:text-xs file:font-semibold" />
                    </div>
                    <button onClick={submitTask} disabled={submitting}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submitting ? "Submitting..." : "Submit for Review"}
                    </button>
                  </div>
                )}

                {/* Admin review */}
                {canReview && pendingSub && (
                  <div className="mb-5 p-4 bg-blue-900/10 border border-blue-800/30 rounded-xl space-y-3">
                    <p className="text-blue-300 font-semibold text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Submitted — awaiting review
                    </p>
                    {pendingSub.notes && <p className="text-gray-300 text-sm italic">"{pendingSub.notes}"</p>}
                    {pendingSub.proofs && pendingSub.proofs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-gray-400 text-xs uppercase">Attachments</p>
                        {pendingSub.proofs.map(p => (
                          <a key={p.id} href={`https://api.atrail.in${p.fileUrl}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-400 text-sm hover:underline">
                            <Paperclip className="w-3.5 h-3.5" />{p.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                      placeholder="Review comment (optional)..." rows={2} className={`${IN} resize-none`} />
                    <div className="flex gap-2">
                      <button onClick={() => review(pendingSub.id, "ACCEPT")} disabled={!!reviewing}
                        className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-4 h-4" /> Accept
                      </button>
                      <button onClick={() => review(pendingSub.id, "REJECT")} disabled={!!reviewing}
                        className="flex-1 py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <XCircle className="w-4 h-4" /> Request Rework
                      </button>
                    </div>
                  </div>
                )}

                {/* Submission history */}
                {selected.submissions.length > 0 && (
                  <div className="mb-5">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">Submission History</p>
                    <div className="space-y-2">
                      {selected.submissions.map(s => (
                        <div key={s.id} className={`p-3 rounded-xl border text-sm ${s.status === "ACCEPTED" ? "bg-green-900/20 border-green-800/40" : s.status === "REJECTED" ? "bg-red-900/20 border-red-800/40" : "bg-blue-900/20 border-blue-800/30"}`}>
                          <div className="flex justify-between">
                            <span className={`font-semibold ${s.status === "ACCEPTED" ? "text-green-400" : s.status === "REJECTED" ? "text-red-400" : "text-blue-400"}`}>{s.status}</span>
                            <span className="text-gray-500 text-xs">{new Date(s.createdAt).toLocaleDateString("en-IN")}</span>
                          </div>
                          {s.notes && <p className="text-gray-300 text-xs mt-1">Note: {s.notes}</p>}
                          {s.reviewComment && <p className="text-gray-400 text-xs mt-1 italic">Review: {s.reviewComment}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments / Follow-up */}
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Follow-up & Comments ({comments.length})
                  </p>
                  <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                    {comments.length === 0 && <p className="text-gray-600 text-sm text-center py-3">No comments yet</p>}
                    {comments.map(c => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                          {c.author.fullName.charAt(0)}
                        </div>
                        <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-xs font-semibold">{c.author.fullName}</span>
                            <span className="text-gray-600 text-[10px]">{new Date(c.createdAt).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
                          </div>
                          <p className="text-gray-300 text-sm">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && postComment()}
                      placeholder="Add a comment or follow-up..."
                      className={`${IN} flex-1`} />
                    <button onClick={postComment} disabled={sendingComment || !newComment.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                      {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Task Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[rgba(6,22,40,0.98)] border border-[rgba(0,212,255,0.15)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white text-lg font-bold">Assign New Task</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Task Title *</label>
                <input type="text" required value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Prepare Q3 renewal report" className={IN} />
              </div>

              <div>
                <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Description</label>
                <textarea rows={3} value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detailed instructions for the task..." className={`${IN} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Project *</label>
                  <select required value={createForm.projectId}
                    onChange={e => setCreateForm(f => ({ ...f, projectId: e.target.value }))} className={SEL}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Assign To *</label>
                  <select required value={createForm.assignedToId}
                    onChange={e => setCreateForm(f => ({ ...f, assignedToId: e.target.value }))} className={SEL}>
                    <option value="">Select project member...</option>
                    {(isAdmin ? orgUsers : projectMembers).map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Priority</label>
                  <select value={createForm.priority}
                    onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} className={SEL}>
                    <option value="URGENT">🔴 Urgent</option>
                    <option value="HIGH">🟠 High</option>
                    <option value="NORMAL">🔵 Normal</option>
                    <option value="LOW">⚪ Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1.5">Deadline</label>
                  <input type="datetime-local" value={createForm.dueAt}
                    onChange={e => setCreateForm(f => ({ ...f, dueAt: e.target.value }))} className={IN} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-white/10 text-gray-400 hover:bg-white/5 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? "Creating..." : "Assign Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
