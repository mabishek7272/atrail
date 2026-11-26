import Papa from "papaparse";
import { prisma } from "../../db.js";
import { ApiError } from "../../utils/errors.js";
import { Role } from "../../prisma-client.js";
import { notificationsService } from "../notifications/notifications.service.js";

const ROLE_W: Record<string, number> = {
  GOD: 200, DEVELOPER: 190, RESELLER_SUPER_ADMIN: 150,
  ADMIN: 100, ELITE: 80, USER: 70, INTERN: 30,
};

function isAdminPlus(role: string) {
  return (ROLE_W[role] ?? 0) >= ROLE_W["ADMIN"];
}

async function ensureProjectAccess(
  userId: string,
  orgId: string,
  role: string,
  projectId: string
) {
  const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
  const project = await prisma.project.findFirst({
    where: isGodLevel ? { id: projectId } : { id: projectId, organizationId: orgId },
    select: { id: true, headId: true },
  });
  if (!project) throw new ApiError(404, "Project not found");

  if (isAdminPlus(role)) return project;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new ApiError(403, "Not a member of this project");

  return project;
}

// Validates a candidate dependency set for `taskId`: every id must exist, belong to the
// same project, not be the task itself, and not introduce a cycle through existing edges
// of OTHER tasks (we're about to replace taskId's own edges, so we only need to check that
// taskId isn't reachable FROM each candidate via everyone else's current edges).
async function validateDependencyCandidates(
  projectId: string,
  taskId: string,
  dependsOnTaskIds: string[]
) {
  const uniqueIds = Array.from(new Set(dependsOnTaskIds));
  if (uniqueIds.includes(taskId))
    throw new ApiError(400, "A task cannot depend on itself");

  if (uniqueIds.length === 0) return uniqueIds;

  const candidates = await prisma.task.findMany({
    where: { id: { in: uniqueIds }, projectId },
    select: { id: true },
  });
  if (candidates.length !== uniqueIds.length)
    throw new ApiError(400, "One or more dependencies were not found in this project");

  // Cycle check: BFS forward from each candidate, following "depends on" edges (node -> what
  // it depends on) through the existing graph (excluding taskId's own current edges, since
  // those are being replaced). If taskId is reachable from a candidate this way, it means
  // candidate already (transitively) depends on taskId — adding "taskId depends on candidate"
  // would close that into a cycle.
  const allEdges = await prisma.taskDependency.findMany({
    where: { task: { projectId }, taskId: { not: taskId } },
    select: { taskId: true, dependsOnTaskId: true },
  });
  const adjacency = new Map<string, string[]>();
  for (const e of allEdges) {
    if (!adjacency.has(e.taskId)) adjacency.set(e.taskId, []);
    adjacency.get(e.taskId)!.push(e.dependsOnTaskId);
  }

  for (const start of uniqueIds) {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === taskId)
        throw new ApiError(400, "That dependency would create a cycle");
      for (const next of adjacency.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  return uniqueIds;
}

export const tasksService = {
  async allTasks(_userId: string, orgId: string, role: string) {
    if (!isAdminPlus(role)) throw new ApiError(403, "Forbidden");

    const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
    const where = isGodLevel && orgId ? { project: { organizationId: orgId } }
      : isGodLevel ? {}
      : { project: { organizationId: orgId } };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return { tasks };
  },

  async myTasks(userId: string, orgId: string) {
    const me = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId, isActive: true },
      select: { id: true },
    });
    if (!me) throw new ApiError(401, "Unauthorized");

    const tasks = await prisma.task.findMany({
      where: { 
        assignedToId: userId,
        project: { organizationId: orgId }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return { tasks };
  },

  async projectTasks(
    userId: string,
    orgId: string,
    role: string,
    projectId: string
  ) {
    await ensureProjectAccess(userId, orgId, role, projectId);

    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      include: {
        assignedTo: { select: { id: true, fullName: true, role: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { proofs: true },
        },
      },
    });

    return { tasks };
  },

  async getTask(userId: string, orgId: string, role: string, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { 
          select: { 
            id: true, 
            name: true, 
            headId: true,
            organizationId: true 
          } 
        },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          include: { 
            proofs: {
              select: {
                id: true,
                fileUrl: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
              }
            }
          },
        },
      },
    });
    
    if (!task) throw new ApiError(404, "Task not found");
    const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
    if (!isGodLevel && task.project.organizationId !== orgId)
      throw new ApiError(404, "Task not found");

    // Admin+ can see all tasks
    if (isAdminPlus(role)) return task;

    // ELITE project head can see tasks in their project
    if (role === "ELITE" && task.project.headId === userId) return task;

    // Assigned user can see their own tasks
    if (task.assignedToId === userId) return task;

    // Assigned by user can see tasks they assigned
    if (task.assignedById === userId) return task;

    // Check if user is a project member (for ELITE who might not be head)
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });
    if (member && role === "ELITE") return task;

    throw new ApiError(403, "Forbidden");
  },

  async createTask(
    actorId: string,
    orgId: string,
    role: string,
    body: {
      projectId: string;
      title: string;
      description?: string;
      assignedToId: string;
      priority?: string;
      startAt?: string;
      dueAt?: string;
      dependsOnTaskIds?: string[];
    }
  ) {
    const project = await ensureProjectAccess(
      actorId,
      orgId,
      role,
      body.projectId
    );

    // Permission: Admin+ OR Elite Head only
    const isHead = role === "ELITE" && project.headId === actorId;
    if (!isAdminPlus(role) && !isHead)
      throw new ApiError(403, "Not allowed to assign tasks in this project");

    // assignedTo must exist and be active (GOD can assign across orgs)
    const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
    const target = await prisma.user.findFirst({
      where: isGodLevel
        ? { id: body.assignedToId, isActive: true }
        : { id: body.assignedToId, organizationId: orgId, isActive: true },
      select: { id: true, role: true },
    });
    if (!target) throw new ApiError(404, "Assignee not found");

    const isMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: body.projectId,
          userId: body.assignedToId,
        },
      },
    });
    if (!isMember && !isAdminPlus(role)) throw new ApiError(400, "Assignee is not a project member");

    // Head can assign only to USER
    if (isHead && target.role !== Role.USER)
      throw new ApiError(403, "Project head can assign only to USER role");

    const task = await prisma.task.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        assignedToId: body.assignedToId,
        assignedById: actorId,
        priority: body.priority ? body.priority.toUpperCase() : "NORMAL",
        startAt: body.startAt ? new Date(body.startAt) : undefined,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: {
        project: { select: { id: true, name: true } },
        assignedBy: { select: { fullName: true } },
      },
    });

    if (body.dependsOnTaskIds?.length) {
      const validIds = await validateDependencyCandidates(
        body.projectId,
        task.id,
        body.dependsOnTaskIds
      );
      if (validIds.length) {
        await prisma.taskDependency.createMany({
          data: validIds.map((id) => ({ taskId: task.id, dependsOnTaskId: id })),
        });
      }
    }

    // Notify assignee
    await notificationsService.createNotification(
      orgId,
      body.assignedToId,
      "TASK_ASSIGNED",
      "New task assigned",
      `${task.assignedBy.fullName} assigned you a task: ${task.title}`,
      { taskId: task.id, projectId: body.projectId }
    ).catch(() => {}); // Don't fail task creation if notification fails

    return task;
  },

  async setMyStatus(
    userId: string,
    orgId: string,
    taskId: string,
    status: "IN_PROGRESS"
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.project.organizationId !== orgId)
      throw new ApiError(404, "Task not found");
    if (task.assignedToId !== userId)
      throw new ApiError(403, "Only assignee can update status");

    if (task.status !== "ASSIGNED")
      throw new ApiError(400, "Status change not allowed");

    return prisma.task.update({
      where: { id: taskId },
      data: { status },
      select: { id: true, status: true, updatedAt: true },
    });
  },

  async submitTask(
    userId: string,
    orgId: string,
    taskId: string,
    notes: string | undefined,
    files: Express.Multer.File[]
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.project.organizationId !== orgId)
      throw new ApiError(404, "Task not found");
    if (task.assignedToId !== userId)
      throw new ApiError(403, "Only assignee can submit");
    if (task.status === "ACCEPTED")
      throw new ApiError(400, "Task already accepted");

    const submission = await prisma.taskSubmission.create({
      data: {
        taskId,
        submittedById: userId,
        notes,
        status: "PENDING",
        proofs: {
          create: files.map((f) => ({
            fileUrl: `/uploads/${f.filename}`,
            fileName: f.originalname,
            mimeType: f.mimetype,
            sizeBytes: f.size,
          })),
        },
      },
      include: { proofs: true },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { status: "SUBMITTED" },
    });

    // Notify assigner (and project head if different)
    const assignerId = task.assignedById;
    const submitter = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });

    await notificationsService.createNotification(
      orgId,
      assignerId,
      "TASK_SUBMITTED",
      "Task submitted for review",
      `${submitter?.fullName || "Someone"} submitted task: ${task.title}`,
      { taskId: task.id, projectId: task.projectId, submissionId: submission.id }
    ).catch(() => {});

    // Also notify project head if different from assigner
    if (task.project.headId && task.project.headId !== assignerId) {
      await notificationsService.createNotification(
        orgId,
        task.project.headId,
        "TASK_SUBMITTED",
        "Task submitted for review",
        `${submitter?.fullName || "Someone"} submitted task: ${task.title}`,
        { taskId: task.id, projectId: task.projectId, submissionId: submission.id }
      ).catch(() => {});
    }

    return submission;
  },

  async reviewSubmission(
    reviewerId: string,
    orgId: string,
    reviewerRole: string,
    submissionId: string,
    decision: "ACCEPT" | "REJECT",
    comment?: string
  ) {
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: { task: { include: { project: true } } },
    });
    if (!submission || submission.task.project.organizationId !== orgId)
      throw new ApiError(404, "Submission not found");

    const task = submission.task;

    const isAllowed =
      isAdminPlus(reviewerRole) ||
      task.assignedById === reviewerId ||
      task.project.headId === reviewerId;

    if (!isAllowed)
      throw new ApiError(403, "Not allowed to review this submission");
    if (submission.status !== "PENDING")
      throw new ApiError(400, "Already reviewed");

    const newStatus = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";

    const updated = await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: {
        status: newStatus,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED" },
    });

    // Notify submitter
    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { fullName: true },
    });

    await notificationsService.createNotification(
      orgId,
      submission.submittedById,
      "TASK_REVIEWED",
      decision === "ACCEPT" ? "Task accepted" : "Task rejected",
      `${reviewer?.fullName || "Reviewer"} ${decision === "ACCEPT" ? "accepted" : "rejected"} your submission for task: ${task.title}${comment ? `\n\nComment: ${comment}` : ""}`,
      { taskId: task.id, projectId: task.projectId, submissionId: submission.id }
    ).catch(() => {});

    return { submission: updated };
  },

  async deleteTask(actorId: string, orgId: string, role: string, taskId: string) {
    if (!isAdminPlus(role)) throw new ApiError(403, "Not allowed to delete tasks");

    const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];
    const task = await prisma.task.findFirst({
      where: isGodLevel ? { id: taskId } : { id: taskId, project: { organizationId: orgId } },
      select: { id: true, title: true },
    });
    if (!task) throw new ApiError(404, "Task not found");

    await prisma.task.delete({ where: { id: taskId } });
    return { deleted: true };
  },

  async projectGantt(
    userId: string,
    orgId: string,
    role: string,
    projectId: string
  ) {
    await ensureProjectAccess(userId, orgId, role, projectId);

    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }],
      include: {
        assignedTo: { select: { id: true, fullName: true, role: true } },
        dependsOn: { select: { dependsOnTaskId: true } },
      },
    });

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        startAt: t.startAt,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        estimatedHours: t.estimatedHours,
        assignedTo: t.assignedTo,
        dependsOnTaskIds: t.dependsOn.map((d) => d.dependsOnTaskId),
      })),
    };
  },

  async updateSchedule(
    userId: string,
    orgId: string,
    role: string,
    taskId: string,
    body: { startAt?: string | null; dueAt?: string | null }
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.project.organizationId !== orgId)
      throw new ApiError(404, "Task not found");

    const isHead = role === "ELITE" && task.project.headId === userId;
    const isAssignee = task.assignedToId === userId;
    if (!isAdminPlus(role) && !isHead && !isAssignee)
      throw new ApiError(403, "Not allowed to reschedule this task");

    const nextStart =
      body.startAt === undefined
        ? task.startAt
        : body.startAt
        ? new Date(body.startAt)
        : null;
    const nextDue =
      body.dueAt === undefined
        ? task.dueAt
        : body.dueAt
        ? new Date(body.dueAt)
        : null;

    if (nextStart && nextDue && nextStart > nextDue)
      throw new ApiError(400, "Start date must be before due date");

    return prisma.task.update({
      where: { id: taskId },
      data: { startAt: nextStart, dueAt: nextDue },
      select: { id: true, startAt: true, dueAt: true, updatedAt: true },
    });
  },

  async setDependencies(
    userId: string,
    orgId: string,
    role: string,
    taskId: string,
    dependsOnTaskIds: string[]
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.project.organizationId !== orgId)
      throw new ApiError(404, "Task not found");

    const isHead = role === "ELITE" && task.project.headId === userId;
    if (!isAdminPlus(role) && !isHead)
      throw new ApiError(403, "Not allowed to edit dependencies for this task");

    const validIds = await validateDependencyCandidates(
      task.projectId,
      taskId,
      dependsOnTaskIds
    );

    await prisma.$transaction([
      prisma.taskDependency.deleteMany({ where: { taskId } }),
      ...(validIds.length
        ? [
            prisma.taskDependency.createMany({
              data: validIds.map((id) => ({ taskId, dependsOnTaskId: id })),
            }),
          ]
        : []),
    ]);

    const deps = await prisma.taskDependency.findMany({
      where: { taskId },
      select: { dependsOnTaskId: true },
    });
    return { taskId, dependsOnTaskIds: deps.map((d) => d.dependsOnTaskId) };
  },

  async exportProjectCsv(
    userId: string,
    orgId: string,
    role: string,
    projectId: string
  ) {
    await ensureProjectAccess(userId, orgId, role, projectId);

    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        assignedTo: { select: { email: true } },
        dependsOn: { select: { dependsOnTaskId: true } },
      },
    });

    const rows = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      assigneeEmail: t.assignedTo.email,
      priority: t.priority,
      status: t.status,
      startAt: t.startAt ? t.startAt.toISOString().slice(0, 10) : "",
      dueAt: t.dueAt ? t.dueAt.toISOString().slice(0, 10) : "",
      estimatedHours: t.estimatedHours ?? "",
      dependsOnIds: t.dependsOn.map((d) => d.dependsOnTaskId).join("|"),
    }));

    return Papa.unparse(rows, {
      columns: [
        "id",
        "title",
        "description",
        "assigneeEmail",
        "priority",
        "status",
        "startAt",
        "dueAt",
        "estimatedHours",
        "dependsOnIds",
      ],
    });
  },

  async importProjectCsv(
    userId: string,
    orgId: string,
    role: string,
    projectId: string,
    csvText: string
  ) {
    const project = await ensureProjectAccess(userId, orgId, role, projectId);
    const isHead = role === "ELITE" && project.headId === userId;
    if (!isAdminPlus(role) && !isHead)
      throw new ApiError(403, "Not allowed to import tasks into this project");

    const isGodLevel = (ROLE_W[role] ?? 0) >= ROLE_W["RESELLER_SUPER_ADMIN"];

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, string>[];

    const existingTasks = await prisma.task.findMany({
      where: { projectId },
      select: { id: true, title: true },
    });
    const byId = new Set(existingTasks.map((t) => t.id));
    const byTitle = new Map<string, string>(
      existingTasks.map((t): [string, string] => [t.title.toLowerCase(), t.id])
    );

    let created = 0;
    let updated = 0;
    const rowErrors: { row: number; reason: string }[] = [];
    const rowTaskIds: (string | null)[] = [];
    const rowDependsOn: string[][] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const title = (r.title || "").trim();
      const depsRaw = (r.dependsOnIds || "").trim();
      rowDependsOn.push(
        depsRaw ? depsRaw.split("|").map((s) => s.trim()).filter(Boolean) : []
      );

      if (!title) {
        rowErrors.push({ row: i + 2, reason: "Missing title" });
        rowTaskIds.push(null);
        continue;
      }

      let assignedToId: string | undefined;
      if (r.assigneeEmail) {
        const assignee = await prisma.user.findFirst({
          where: isGodLevel
            ? { email: r.assigneeEmail.trim(), isActive: true }
            : { email: r.assigneeEmail.trim(), organizationId: orgId, isActive: true },
          select: { id: true },
        });
        if (!assignee) {
          rowErrors.push({
            row: i + 2,
            reason: `Unknown or inactive assignee email: ${r.assigneeEmail}`,
          });
          rowTaskIds.push(null);
          continue;
        }
        assignedToId = assignee.id;
      }

      const priority = r.priority ? r.priority.toUpperCase() : undefined;
      const status = r.status ? r.status.toUpperCase() : undefined;
      const estimatedHours = r.estimatedHours ? Number(r.estimatedHours) : undefined;
      const validEstimatedHours =
        estimatedHours !== undefined && !Number.isNaN(estimatedHours)
          ? estimatedHours
          : undefined;

      const existingId = r.id && byId.has(r.id.trim()) ? r.id.trim() : undefined;

      if (existingId) {
        await prisma.task.update({
          where: { id: existingId },
          data: {
            title,
            description: r.description || undefined,
            ...(assignedToId ? { assignedToId } : {}),
            ...(priority ? { priority: priority as any } : {}),
            ...(status ? { status: status as any } : {}),
            ...(r.startAt ? { startAt: new Date(r.startAt) } : {}),
            ...(r.dueAt ? { dueAt: new Date(r.dueAt) } : {}),
            ...(validEstimatedHours !== undefined
              ? { estimatedHours: validEstimatedHours }
              : {}),
          },
        });
        updated++;
        rowTaskIds.push(existingId);
      } else {
        if (!assignedToId) {
          rowErrors.push({
            row: i + 2,
            reason: "New task requires a valid assigneeEmail",
          });
          rowTaskIds.push(null);
          continue;
        }
        const newTask = await prisma.task.create({
          data: {
            projectId,
            title,
            description: r.description || undefined,
            assignedToId,
            assignedById: userId,
            priority: (priority as any) || "NORMAL",
            startAt: r.startAt ? new Date(r.startAt) : undefined,
            dueAt: r.dueAt ? new Date(r.dueAt) : undefined,
            estimatedHours: validEstimatedHours,
          },
        });
        created++;
        rowTaskIds.push(newTask.id);
        byTitle.set(title.toLowerCase(), newTask.id);
      }
    }

    // Pass 2: resolve dependency references now that every row has a real task id
    const dependencyWarnings: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const taskId = rowTaskIds[i];
      const depsRefs = rowDependsOn[i];
      if (!taskId || depsRefs.length === 0) continue;

      const resolved: string[] = [];
      for (const ref of depsRefs) {
        if (byId.has(ref) || rowTaskIds.includes(ref)) {
          resolved.push(ref);
        } else {
          const byTitleId = byTitle.get(ref.toLowerCase());
          if (byTitleId) resolved.push(byTitleId);
          else
            dependencyWarnings.push({
              row: i + 2,
              reason: `Could not resolve dependency reference "${ref}"`,
            });
        }
      }

      if (resolved.length === 0) continue;

      try {
        const validIds = await validateDependencyCandidates(
          projectId,
          taskId,
          resolved
        );
        if (validIds.length) {
          await prisma.$transaction([
            prisma.taskDependency.deleteMany({ where: { taskId } }),
            prisma.taskDependency.createMany({
              data: validIds.map((id) => ({ taskId, dependsOnTaskId: id })),
            }),
          ]);
        }
      } catch (e: any) {
        dependencyWarnings.push({
          row: i + 2,
          reason: e.message || "Invalid dependency",
        });
      }
    }

    return { created, updated, rowErrors, dependencyWarnings };
  },
};
