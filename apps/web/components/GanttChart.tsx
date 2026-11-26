"use client";

import { useEffect, useRef } from "react";
import Gantt, { GanttTask as FrappeTask } from "frappe-gantt";
import { format, parseISO, addDays, isBefore } from "date-fns";
import "./GanttChart.css";

export type GanttTaskRow = {
  id: string;
  title: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED" | "REJECTED";
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  startAt: string | null;
  dueAt: string | null;
  createdAt: string;
  estimatedHours: number | null;
  assignedTo: { id: string; fullName: string; role: string };
  dependsOnTaskIds: string[];
};

const PROGRESS_BY_STATUS: Record<GanttTaskRow["status"], number> = {
  ASSIGNED: 0,
  IN_PROGRESS: 40,
  SUBMITTED: 75,
  ACCEPTED: 100,
  REJECTED: 100,
};

function toFrappeTasks(rows: GanttTaskRow[]): FrappeTask[] {
  return rows.map((r) => {
    const start = parseISO(r.startAt ?? r.createdAt);
    let end = r.dueAt ? parseISO(r.dueAt) : addDays(start, 1);
    if (isBefore(end, start)) end = addDays(start, 1);

    return {
      id: r.id,
      name: r.title,
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      progress: PROGRESS_BY_STATUS[r.status] ?? 0,
      dependencies: r.dependsOnTaskIds.join(","),
      custom_class: `gantt-priority-${r.priority.toLowerCase()} gantt-status-${r.status.toLowerCase()}`,
    };
  });
}

export default function GanttChart({
  tasks,
  viewMode = "Week",
  onDateChange,
  onTaskClick,
}: {
  tasks: GanttTaskRow[];
  viewMode?: "Day" | "Week" | "Month";
  onDateChange?: (taskId: string, start: Date, end: Date) => void;
  onTaskClick?: (taskId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks in refs so re-instantiating the chart on data/view
  // changes doesn't require them in the effect's dependency array.
  const onDateChangeRef = useRef(onDateChange);
  const onTaskClickRef = useRef(onTaskClick);
  onDateChangeRef.current = onDateChange;
  onTaskClickRef.current = onTaskClick;

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    if (tasks.length === 0) return;

    new Gantt(containerRef.current, toFrappeTasks(tasks), {
      view_mode: viewMode,
      date_format: "YYYY-MM-DD",
      on_click: (task) => onTaskClickRef.current?.(task.id),
      on_date_change: (task, start, end) =>
        onDateChangeRef.current?.(task.id, start, end),
    });
  }, [tasks, viewMode]);

  if (tasks.length === 0) {
    return (
      <div className="gantt-empty">
        No tasks yet — create a task to see it on the timeline.
      </div>
    );
  }

  return <div ref={containerRef} className="gantt-wrapper" />;
}
