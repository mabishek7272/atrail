"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import Skeleton from "@/components/ui/Skeleton";
import { Activity, Users, CheckCircle, AlertTriangle, Briefcase, FileText } from "lucide-react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

type Notice = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  createdBy: { fullName: string };
  seen: boolean;
};

type OverviewStats = {
  totalProjects: number;
  totalTasks: number;
  totalUsers: number;
  activeEmergencies: number;
  pendingLeaves: number;
  tasksByStatus: { status: string; _count: { id: number } }[];
};

export default function SuperDashboard() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [taskStats, setTaskStats] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [noticesRes, statsRes, pendingUsersRes, taskStatsRes, attendanceRes] = await Promise.all([
          authedFetch<{ ok: true; notices: Notice[] }>("/notices"),
          authedFetch<{ ok: true; overview: OverviewStats }>("/analytics/overview"),
          authedFetch<{ ok: true; users: any[] }>("/users/pending").catch(() => ({ ok: false, users: [] })),
          authedFetch<{ ok: true; stats: any[] }>("/analytics/task-stats").catch(() => ({ ok: false, stats: [] })),
          authedFetch<{ ok: true; summary: any[] }>("/analytics/attendance-summary").catch(() => ({ ok: false, summary: [] }))
        ]);
        setNotices((noticesRes.notices ?? []).slice(0, 3));
        setStats(statsRes.overview);
        setPendingUsersCount(pendingUsersRes.users?.length ?? 0);
        setTaskStats(taskStatsRes.stats ?? []);
        setAttendance(attendanceRes.summary ?? []);
      } catch (e) {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const completedTasks = stats?.tasksByStatus.find(s => s.status === 'COMPLETED' || s.status === 'APPROVED')?._count.id || 0;
  const inProgressTasks = stats?.tasksByStatus.find(s => s.status === 'IN_PROGRESS')?._count.id || 0;

  // Chart Data Configurations
  const doughnutData = {
    labels: stats?.tasksByStatus.map((s) => s.status.replace("_", " ")) || [],
    datasets: [{
      data: stats?.tasksByStatus.map((s) => s._count.id) || [],
      backgroundColor: ['#EAB308', '#22C55E', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'],
      borderWidth: 0,
    }]
  };

  const barData = {
    labels: taskStats.map(s => s.fullName.split(' ')[0]),
    datasets: [
      { label: 'Completed', data: taskStats.map(s => s.accepted), backgroundColor: '#22C55E' },
      { label: 'In Progress', data: taskStats.map(s => s.inProgress), backgroundColor: '#EAB308' },
      { label: 'Submitted', data: taskStats.map(s => s.submitted), backgroundColor: '#3B82F6' },
    ]
  };

  const attendanceData = {
    labels: attendance.map(a => a.fullName.split(' ')[0]),
    datasets: [
      { label: 'Total Hours this Month', data: attendance.map(a => Number(a.totalHours.toFixed(1))), backgroundColor: '#3B82F6' },
      { label: 'Avg Hrs/Day', data: attendance.map(a => Number(a.avgHours)), backgroundColor: '#8B5CF6' },
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: '#A1A1AA', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#71717A', font: { size: 10 } }, grid: { color: '#1E293B' } },
      y: { ticks: { color: '#71717A', font: { size: 10 } }, grid: { color: '#1E293B' } },
    }
  };

  return (
    <AppShell title="Command Center" subtitle="Real-time operational overview.">
      
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Link href="/projects" className="block hover:scale-[1.02] transition-transform duration-200">
          <Card className="hover:border-primary/40 cursor-pointer h-full transition-colors duration-200">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Briefcase size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium tracking-wide">TOTAL PROJECTS</p>
                {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <p className="text-2xl font-bold text-white">{stats?.totalProjects ?? 0}</p>}
              </div>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/tasks" className="block hover:scale-[1.02] transition-transform duration-200">
          <Card className="hover:border-primary/40 cursor-pointer h-full transition-colors duration-200">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium tracking-wide">ACTIVE TASKS</p>
                {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <p className="text-2xl font-bold text-white">{inProgressTasks}</p>}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/directory" className="block hover:scale-[1.02] transition-transform duration-200">
          <Card className="hover:border-primary/40 cursor-pointer h-full transition-colors duration-200">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium tracking-wide">TOTAL WORKFORCE</p>
                {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <p className="text-2xl font-bold text-white">{stats?.totalUsers ?? 0}</p>}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/emergency" className="block hover:scale-[1.02] transition-transform duration-200">
          <Card className={`hover:border-red-500/50 cursor-pointer h-full transition-colors duration-200 ${stats?.activeEmergencies ? "border-red-500/50 bg-red-500/5" : ""}`}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-10 w-10 flex items-center justify-center rounded-lg ${stats?.activeEmergencies ? "bg-red-500/20 text-red-500" : "bg-zinc-800 text-text-muted"}`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium tracking-wide">EMERGENCIES</p>
                {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <p className={`text-2xl font-bold ${stats?.activeEmergencies ? "text-red-500" : "text-white"}`}>{stats?.activeEmergencies ?? 0}</p>}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-primary/20 bg-primary/5 flex flex-col justify-between">
          <CardHeader title="Pending Action Items" subtitle="Requires your input" />
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/dashboard/super/approvals"
                className="p-4 rounded-xl border border-primary/20 glass-panel hover:bg-zinc-800 transition flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm font-bold uppercase tracking-wider text-primary group-hover:text-primary-light">New Users</span>
                  <p className="text-xs text-text-muted mt-1">Pending account approval</p>
                </div>
                {loading ? (
                  <Skeleton className="h-8 w-8 rounded-full" />
                ) : pendingUsersCount > 0 ? (
                  <span className="h-8 w-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">{pendingUsersCount}</span>
                ) : (
                  <span className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">0</span>
                )}
              </Link>
              
              <Link
                href="/hr"
                className="p-4 rounded-xl border border-primary/20 glass-panel hover:bg-zinc-800 transition flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm font-bold uppercase tracking-wider text-primary group-hover:text-primary-light">Leave Requests</span>
                  <p className="text-xs text-text-muted mt-1">Awaiting Review</p>
                </div>
                {stats?.pendingLeaves ? (
                  <span className="h-8 w-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">{stats.pendingLeaves}</span>
                ) : (
                  <span className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-text-muted">0</span>
                )}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Notices" subtitle="Broadcast updates" />
          {loading ? (
            <CardContent className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </CardContent>
          ) : notices.length === 0 ? (
            <CardContent className="text-sm text-text-muted text-center py-6">
              No recent announcements.
            </CardContent>
          ) : (
            <CardContent className="space-y-2">
              {notices.map((n) => (
                <Link
                  key={n.id}
                  href="/notices"
                  className="block p-3 rounded-xl border border-primary/20 hover:bg-zinc-800/50 transition group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-primary group-hover:text-primary-light truncate flex items-center gap-2">
                        {n.title}
                        {n.pinned && <Badge tone="blue">Pinned</Badge>}
                      </div>
                      <div className="text-xs text-text-muted truncate mt-1">
                        {n.content}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              <Link
                href="/notices"
                className="block text-xs font-medium text-primary hover:text-primary-light transition mt-2 pt-2 border-t border-primary/20 text-center"
              >
                View all communications →
              </Link>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Visual Analytics Grid */}
      {!loading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <Card className="border-primary/20 bg-[rgba(6,22,40,0.4)] backdrop-blur-md">
            <CardHeader title="Task Status Distribution" subtitle="All project tasks grouped by status" />
            <CardContent className="flex justify-center items-center p-6">
              <div className="w-full max-w-[210px] aspect-square">
                <Doughnut data={doughnutData} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#A1A1AA', font: { size: 10 } } } } }} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-[rgba(6,22,40,0.4)] backdrop-blur-md md:col-span-2">
            <CardHeader title="Employee Task Status" subtitle="Workload distribution by team member" />
            <CardContent className="p-6">
              <div className="h-64 sm:h-72">
                <Bar data={barData} options={{ ...chartOptions, maintainAspectRatio: false }} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-[rgba(6,22,40,0.4)] backdrop-blur-md md:col-span-3">
            <CardHeader title="Monthly Attendance Summary" subtitle="Total and average working hours this month" />
            <CardContent className="p-6">
              <div className="h-64 sm:h-72">
                <Bar data={attendanceData} options={{ ...chartOptions, maintainAspectRatio: false }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
