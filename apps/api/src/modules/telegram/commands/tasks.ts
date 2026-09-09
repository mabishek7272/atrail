import { Context } from "telegraf";
import { prisma } from "../../../db.js";
import { getSession, setState } from "../session.js";
import { mainMenu, taskStatusMenu, cancelMenu } from "../keyboards/menus.js";

const STATUS_EMOJI: Record<string, string> = {
  ASSIGNED: "📌",
  IN_PROGRESS: "🔄",
  SUBMITTED: "📤",
  ACCEPTED: "✅",
  REJECTED: "❌",
};

export async function handleTasksList(ctx: Context) {
  const session = await getSession(ctx.chat!.id);
  if (!session) return;

  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: session.userId,
      status: { notIn: ["ACCEPTED"] },
    },
    include: { project: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
    take: 10,
  });

  if (!tasks.length) {
    await ctx.reply("✅ No pending tasks — you're all caught up!", mainMenu());
    return;
  }

  const lines = tasks.map((t, i) => {
    const emoji = STATUS_EMOJI[t.status] || "📋";
    const due = t.dueAt ? `⏰ ${new Date(t.dueAt).toLocaleDateString("en-IN")}` : "No deadline";
    const shortId = t.id.slice(-8);
    return `${i + 1}. ${emoji} <b>${escMd(t.title)}</b>\n   📁 ${escMd(t.project?.name ?? "—")}\n   ${due}\n   ID: <code>${shortId}</code>`;
  });

  await ctx.reply(
    `📋 <b>Your Tasks (${tasks.length})</b>\n\n${lines.join("\n\n")}\n\nTo update a task, tap the ID below:`,
    { parse_mode: "HTML" }
  );

  for (const t of tasks.slice(0, 5)) {
    await ctx.reply(
      `<b>${escMd(t.title)}</b> — ${t.status}`,
      { parse_mode: "HTML", ...taskStatusMenu(t.id.slice(-8)) }
    );
  }
}

export async function handleTaskCreate(ctx: Context) {
  const session = await getSession(ctx.chat!.id);
  if (!session) return;

  const allowed = ["ADMIN", "RESELLER_SUPER_ADMIN", "ELITE", "USER"];
  if (!allowed.includes(session.role)) {
    await ctx.reply("❌ Only Admins, Elites and Tenants can create tasks.");
    return;
  }

  await setState(ctx.chat!.id, "await_task_title");
  await ctx.reply("📝 Enter the task <b>title</b>:", { parse_mode: "HTML", ...cancelMenu() });
}

export async function handleTaskAction(ctx: Context, action: "START" | "SUBMIT", shortId: string) {
  const session = await getSession(ctx.chat!.id);
  if (!session) return;

  const task = await prisma.task.findFirst({
    where: { id: { endsWith: shortId } },
  });

  if (!task) {
    await ctx.reply("❌ Task not found.");
    return;
  }

  // Verify ownership
  if (task.assignedToId !== session.userId) {
    await ctx.reply("❌ This task is not assigned to you.");
    return;
  }

  const newStatus = action === "START" ? "IN_PROGRESS" : "SUBMITTED";
  await prisma.task.update({ where: { id: task.id }, data: { status: newStatus } });

  await ctx.reply(
    `✅ Task <b>${escMd(task.title)}</b> → <b>${newStatus}</b>`,
    { parse_mode: "HTML", ...mainMenu() }
  );
}

export async function handleTaskCreationFlow(ctx: Context, text: string) {
  const chatId = ctx.chat!.id;
  const session = await getSession(chatId);
  if (!session) return;

  const state = session.state;

  if (state === "await_task_title") {
    await setState(chatId, "await_task_assignee", { taskTitle: text.trim() });
    await ctx.reply(
      "👤 Enter the <b>email</b> of the person to assign this task to:",
      { parse_mode: "HTML", ...cancelMenu() }
    );
    return;
  }

  if (state === "await_task_assignee") {
    const email = text.trim().toLowerCase();
    const assignee = await prisma.user.findFirst({
      where: { email, organizationId: session.orgId },
    });
    if (!assignee) {
      await ctx.reply("❌ User not found in your organization. Please enter a valid email:");
      return;
    }
    await setState(chatId, "await_task_deadline", {
      assigneeId: assignee.id,
      assigneeName: assignee.fullName,
    });
    await ctx.reply(
      `👤 Assignee: <b>${escMd(assignee.fullName)}</b>\n\nEnter deadline (e.g. <code>2026-06-15</code>) or type <b>none</b>:`,
      { parse_mode: "HTML", ...cancelMenu() }
    );
    return;
  }

  if (state === "await_task_deadline") {
    await setState(chatId, "await_task_project");
    const data = session.pendingData || {};
    const dueAt = text.toLowerCase() === "none" ? null : new Date(text);

    if (dueAt && isNaN(dueAt.getTime())) {
      await ctx.reply("❌ Invalid date format. Use YYYY-MM-DD or type <b>none</b>:", { parse_mode: "HTML" });
      return;
    }

    await setState(chatId, "await_task_confirm", {
      dueAt: dueAt ? dueAt.toISOString() : "",
    });

    const project = await prisma.project.findFirst({
      where: { organizationId: session.orgId },
      select: { id: true, name: true },
    });

    if (!project) {
      await ctx.reply("❌ No projects found in your organization. Please create a project first.");
      await setState(chatId, undefined);
      return;
    }

    await setState(chatId, undefined, { projectId: project.id });

    const task = await prisma.task.create({
      data: {
        title: data.taskTitle!,
        projectId: project.id,
        assignedToId: data.assigneeId!,
        assignedById: session.userId,
        status: "ASSIGNED",
        dueAt: dueAt ?? undefined,
      },
    });

    await ctx.reply(
      `✅ <b>Task Created!</b>\n\n📝 ${escMd(task.title)}\n👤 Assigned to: ${escMd(data.assigneeName ?? "")}\n📁 Project: ${escMd(project.name)}\n⏰ Due: ${dueAt ? dueAt.toLocaleDateString("en-IN") : "None"}`,
      { parse_mode: "HTML", ...mainMenu() }
    );
  }
}

function escMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
