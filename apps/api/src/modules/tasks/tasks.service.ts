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
      dueAt?: string;
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
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: {
        project: { select: { id: true, name: true } },
        assignedBy: { select: { fullName: true } },
      },
    });

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
};
