import { Context, Markup } from "telegraf";
import { prisma } from "../../../db.js";
import { getSession, setState } from "../session.js";
import { chat, ChatMessage } from "../../ai/ai.service.js";
import { mainMenu } from "../keyboards/menus.js";
import { notificationsService } from "../../notifications/notifications.service.js";
import { sendEmailTo } from "../../notifications/email.js";
import { sendTelegramNotification } from "../notify.js";
import { ROLE_WEIGHTS } from "../../../middlewares/rbac.js";

const histories = new Map<number, ChatMessage[]>();

export async function handleAiChat(ctx: Context) {
  const chatId = ctx.chat!.id;
  await setState(chatId, "await_ai_msg");
  await ctx.reply(
    "<b>Atrail AI Agent</b>\n\nI can take actions for you. Just describe what you need:\n\n" +
    "• <i>Assign task \"Fix login bug\" to Sara, due Friday, high priority</i>\n" +
    "• <i>Send email to Mr. Arunkumar about the Q3 renewal review</i>\n" +
    "• <i>Send a Telegram message to Thejitha: your task is approved</i>\n" +
    "• <i>Show me my pending tasks</i>\n\n" +
    "Type /menu to go back.",
    { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("◀ Main Menu", "MAIN_MENU")]]) }
  );
}

export async function handleAiMessage(ctx: Context, text: string) {
  const chatId = ctx.chat!.id;
  const session = await getSession(chatId);
  if (!session?.userId) return;

  if (!histories.has(chatId)) histories.set(chatId, []);
  const history = histories.get(chatId)!;

  const isGodLevel = ROLE_WEIGHTS[session.role] >= ROLE_WEIGHTS["GOD"];
  const isResellerOrAbove = ROLE_WEIGHTS[session.role] >= ROLE_WEIGHTS["RESELLER_SUPER_ADMIN"];

  // Load context — GOD users see across all orgs
  const [dbUser, pendingTasks, unreadNotifs, orgUsers, orgProjects, allOrgs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { organization: true, profile: true },
    }),
    prisma.task.count({ where: { assignedToId: session.userId, status: { notIn: ["ACCEPTED"] } } }),
    prisma.notification.count({ where: { userId: session.userId, read: false } }),
    // GOD/RESELLER see all users, others see org-scoped
    isResellerOrAbove
      ? prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, fullName: true, email: true, role: true, organizationId: true, organization: { select: { name: true } } },
          take: 100,
        })
      : prisma.user.findMany({
          where: { organizationId: session.orgId, isActive: true },
          select: { id: true, fullName: true, email: true, role: true, organizationId: true, organization: { select: { name: true } } },
          take: 50,
        }),
    isResellerOrAbove
      ? prisma.project.findMany({ select: { id: true, name: true, organizationId: true }, take: 50 })
      : prisma.project.findMany({ where: { organizationId: session.orgId }, select: { id: true, name: true, organizationId: true }, take: 20 }),
    isGodLevel
      ? prisma.organization.findMany({ select: { id: true, name: true, orgType: true }, take: 30 })
      : Promise.resolve([]),
  ]);

  history.push({ role: "user", content: text });
  const recentHistory = history.slice(-12);

  await ctx.sendChatAction("typing");

  const userList = orgUsers.map((u: any) =>
    `  ${u.fullName} (${u.role}${isResellerOrAbove ? `, org: ${u.organization?.name}` : ""}) | email: ${u.email} | id: ${u.id}`
  ).join("\n");

  const projectList = orgProjects.map((p: any) =>
    `  ${p.name}${isResellerOrAbove ? ` (org: ${p.organizationId})` : ""} | id: ${p.id}`
  ).join("\n");

  const orgList = isGodLevel
    ? `\nAll Organizations:\n${allOrgs.map((o: any) => `  ${o.name} (${o.orgType}) | id: ${o.id}`).join("\n")}`
    : "";

  const systemPrompt = `You are the Atrail AI Agent — a highly capable, professional executive assistant integrated into the Atrail Enterprise Platform.

Operator Context:
- Name: ${dbUser?.fullName || session.fullName}
- Organization: ${dbUser?.organization?.name || "Platform"}
- Role: ${session.role}
- Pending tasks: ${pendingTasks} | Unread notifications: ${unreadNotifs}
${isGodLevel ? "- Access level: PLATFORM GOD — cross-org full access\n" : ""}
Available Users (for actions):
${userList}

Available Projects:
${projectList}
${orgList}

CAPABILITIES — you can call these tools:
1. create_task — assign a task to any user in any accessible project
2. send_email — send a professional email to any person
3. send_telegram — send a direct Telegram message to any linked user
4. get_tasks — retrieve task list for a user

RESPONSE RULES:
- Be brief and professional (2-3 sentences max for confirmations).
- Match names flexibly ("Sara" matches "Sara Johnson", "Thejitha" matches partial).
- Resolve ambiguity by asking one clarifying question.
- Never show internal IDs to the user.
- Execute tool calls immediately without asking for confirmation.
- After a tool executes, confirm the action was done in one sentence.
- If the user mentions "send email to X about Y", use send_email with a professional email body.
- If the user mentions "message X" or "notify X on Telegram", use send_telegram.`;

  const tools = [
    {
      type: "function",
      function: {
        name: "create_task",
        description: "Create and assign a task to a team member.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            assignedToId: { type: "string", description: "User ID from the available users list" },
            projectId: { type: "string", description: "Project ID (use first available if not specified)" },
            description: { type: "string" },
            priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
            dueAt: { type: "string", description: "ISO date string" },
          },
          required: ["title", "assignedToId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_email",
        description: "Send a professional email to any person.",
        parameters: {
          type: "object",
          properties: {
            toEmail: { type: "string", description: "Recipient's email address" },
            toName: { type: "string" },
            subject: { type: "string" },
            body: { type: "string", description: "Full professional email body (plain text or simple HTML)" },
          },
          required: ["toEmail", "subject", "body"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_telegram",
        description: "Send a direct Telegram message to any linked user.",
        parameters: {
          type: "object",
          properties: {
            recipientUserId: { type: "string", description: "User ID of the Telegram-linked recipient" },
            message: { type: "string", description: "The message to send" },
          },
          required: ["recipientUserId", "message"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_tasks",
        description: "Get pending tasks for a specific user or the current user.",
        parameters: {
          type: "object",
          properties: {
            userId: { type: "string", description: "User ID. Use session user ID if not specified." },
          },
          required: [],
        },
      },
    },
  ];

  let reply: { text: string; tool_calls?: any[] };
  try {
    reply = await chat(recentHistory, {
      maxTokens: 600,
      temperature: 0.3,
      systemPrompt,
      tools,
    });
  } catch {
    await ctx.reply("The AI agent is briefly unavailable. Please try again in a moment.", mainMenu());
    return;
  }

  history.push({ role: "assistant", content: reply.text || "(tool use)" });

  // Process tool calls first
  if (reply.tool_calls?.length) {
    for (const tc of reply.tool_calls) {
      const fn = tc.function?.name;
      let args: any;
      try { args = JSON.parse(tc.function.arguments); } catch { continue; }

      if (fn === "create_task") {
        await executeCreateTask(ctx, session, dbUser, orgUsers, orgProjects, args);
      } else if (fn === "send_email") {
        await executeSendEmail(ctx, session, dbUser, args);
      } else if (fn === "send_telegram") {
        await executeSendTelegram(ctx, session, dbUser, orgUsers, args);
      } else if (fn === "get_tasks") {
        await executeGetTasks(ctx, session, args);
      }
    }
  }

  // Then show the text reply
  if (reply.text) {
    await ctx.reply(reply.text, { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("◀ Main Menu", "MAIN_MENU")]]) });
  }
}

// ── Tool executors ────────────────────────────────────────────────────────────

async function executeCreateTask(ctx: Context, session: any, dbUser: any, orgUsers: any[], orgProjects: any[], args: any) {
  try {
    let projectId = args.projectId;
    const relevantProjects = orgProjects.filter(p => !args.assignedToId || true);
    if (!projectId || !orgProjects.find(p => p.id === projectId)) {
      projectId = orgProjects.find(p => p.organizationId === session.orgId)?.id ?? orgProjects[0]?.id;
    }

    const assignee = orgUsers.find(u => u.id === args.assignedToId);
    if (!assignee || !projectId) {
      await ctx.reply("Could not find the specified user or project. Please check the name and try again.");
      return;
    }

    const task = await prisma.task.create({
      data: {
        organizationId: assignee.organizationId,
        projectId,
        assignedToId: assignee.id,
        assignedById: session.userId,
        title: args.title,
        description: args.description || null,
        priority: args.priority || "NORMAL",
        dueAt: args.dueAt ? new Date(args.dueAt) : null,
        status: "ASSIGNED",
      },
      include: {
        assignedTo: { select: { fullName: true } },
        project: { select: { name: true } },
      },
    });

    notificationsService.createNotification(
      assignee.organizationId, assignee.id, "TASK_ASSIGNED" as any,
      `New task: ${task.title}`,
      `${dbUser?.fullName || "Your manager"} assigned you: "${task.title}" in ${task.project.name}.`
    ).catch(console.error);

    await ctx.reply(
      `<b>Task Created</b>\n\nTitle: ${task.title}\nAssigned to: ${task.assignedTo.fullName}\nProject: ${task.project.name}\nPriority: ${task.priority}${args.dueAt ? `\nDue: ${new Date(args.dueAt).toDateString()}` : ""}`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("◀ Main Menu", "MAIN_MENU")]]) }
    );
  } catch (e: any) {
    console.error("[Bot:create_task]", e.message);
    await ctx.reply("Failed to create the task. Please check the details and try again.");
  }
}

async function executeSendEmail(ctx: Context, session: any, dbUser: any, args: any) {
  try {
    const senderName = dbUser?.fullName || session.fullName;
    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:8px">
        <p style="color:#334155;white-space:pre-line">${args.body}</p>
        <hr style="border-color:#e2e8f0;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px">Sent via Atrail by ${senderName} · atrail.in</p>
      </div>`;

    await sendEmailTo(args.toEmail, args.subject, htmlBody);

    // Also notify sender on Telegram for confirmation
    await ctx.reply(
      `<b>Email Sent</b>\n\nTo: ${args.toName || args.toEmail}\nSubject: ${args.subject}`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("◀ Main Menu", "MAIN_MENU")]]) }
    );
  } catch (e: any) {
    console.error("[Bot:send_email]", e.message);
    await ctx.reply("Failed to send the email. Check the address and try again.");
  }
}

async function executeSendTelegram(ctx: Context, session: any, dbUser: any, orgUsers: any[], args: any) {
  const recipient = orgUsers.find((u: any) => u.id === args.recipientUserId);
  try {
    if (!recipient) {
      await ctx.reply("Could not find that user. Please check the name.");
      return;
    }

    const senderName = dbUser?.fullName || session.fullName;
    const message = `📩 <b>Message from ${senderName}</b>\n\n${args.message}`;
    await sendTelegramNotification(recipient.id, message);

    await ctx.reply(
      `<b>Telegram message sent to ${recipient.fullName}.</b>`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("◀ Main Menu", "MAIN_MENU")]]) }
    );
  } catch (e: any) {
    console.error("[Bot:send_telegram]", e.message);
    await ctx.reply(`Could not deliver the Telegram message — ${recipient?.fullName || "the user"} may not have Telegram linked.`);
  }
}

async function executeGetTasks(ctx: Context, session: any, args: any) {
  try {
    const uid = args.userId || session.userId;
    const tasks = await prisma.task.findMany({
      where: { assignedToId: uid, status: { notIn: ["ACCEPTED"] } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    if (!tasks.length) {
      await ctx.reply("No pending tasks found.", mainMenu());
      return;
    }

    const lines = tasks.map((t, i) =>
      `${i + 1}. <b>${t.title}</b>\n   Project: ${t.project.name} | Status: ${t.status} | Priority: ${t.priority}`
    );
    await ctx.reply(
      `<b>Pending Tasks (${tasks.length})</b>\n\n${lines.join("\n\n")}`,
      { parse_mode: "HTML", ...mainMenu() }
    );
  } catch (e: any) {
    console.error("[Bot:get_tasks]", e.message);
    await ctx.reply("Could not retrieve tasks right now.", mainMenu());
  }
}

export async function handleNotifications(ctx: Context) {
  const session = await getSession(ctx.chat!.id);
  if (!session) return;

  const notifs = await prisma.notification.findMany({
    where: { userId: session.userId, read: false },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (!notifs.length) {
    await ctx.reply("No unread notifications.", mainMenu());
    return;
  }

  const lines = notifs.map((n, i) => `${i + 1}. <b>${n.title}</b>\n   ${n.message}`);
  await ctx.reply(
    `<b>Unread Notifications (${notifs.length})</b>\n\n${lines.join("\n\n")}`,
    { parse_mode: "HTML", ...mainMenu() }
  );

  await prisma.notification.updateMany({
    where: { userId: session.userId, read: false },
    data: { read: true, readAt: new Date() },
  });
}

export function clearHistory(chatId: number) {
  histories.delete(chatId);
}
