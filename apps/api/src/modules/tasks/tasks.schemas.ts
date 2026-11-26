import { z } from "zod";

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  assignedToId: z.string().min(1),
  priority: z.string().optional(),
  startAt: z.string().optional(), // Allow flexible date string from UI
  dueAt: z.string().optional(), // Allow flexible date string from UI
  dependsOnTaskIds: z.array(z.string()).optional(),
});

export const setScheduleSchema = z.object({
  startAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

export const setDependenciesSchema = z.object({
  dependsOnTaskIds: z.array(z.string()),
});

export const setMyTaskStatusSchema = z.object({
  status: z.enum(["ASSIGNED", "IN_PROGRESS", "SUBMITTED"]),
});

export const submitTaskSchema = z.object({
  notes: z.string().max(4000).optional(),
});

export const reviewSubmissionSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  comment: z.string().max(2000).optional(),
});
