import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { usersController } from "./users.controller.js";
import { prisma } from "../../db.js";
import { bot } from "../telegram/bot.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.post(
  "/",
  requireRole("ADMIN", "RESELLER_SUPER_ADMIN"),
  usersController.createUser
);

// only users I can message (directional rule)
usersRouter.get("/messagable", usersController.listMessagable);

// list all users (admin+ only)
usersRouter.get(
  "/",
  requireRole("ADMIN", "RESELLER_SUPER_ADMIN"),
  usersController.listAll
);

// Org directory with role grouping and team structure (admin+ only)
usersRouter.get(
  "/directory",
  requireRole("ADMIN", "RESELLER_SUPER_ADMIN"),
  usersController.listOrgDirectory
);

usersRouter.get(
  "/pending",
  requireRole("RESELLER_SUPER_ADMIN"),
  usersController.listPending
);

usersRouter.post(
  "/:userId/approve",
  requireRole("RESELLER_SUPER_ADMIN"),
  usersController.approveUser
);

// Admin assigns Elite to report to them; Elite assigns User to report to Elite
usersRouter.post(
  "/:userId/assign",
  requireRole("ADMIN", "ELITE", "RESELLER_SUPER_ADMIN"),
  usersController.assignReportsTo
);

// Change user role
usersRouter.patch(
  "/:userId/role",
  requireRole("RESELLER_SUPER_ADMIN", "ADMIN", "ELITE"),
  usersController.changeRole
);

// Edit user profile, password, or transfer organization
usersRouter.patch(
  "/:userId",
  requireRole("RESELLER_SUPER_ADMIN", "ADMIN"),
  usersController.updateUser
);

// Delete user
usersRouter.delete(
  "/:userId",
  requireRole("RESELLER_SUPER_ADMIN", "GOD", "DEVELOPER"),
  usersController.deleteUser
);

// Notifications & Firebase
usersRouter.put("/me/fcm", usersController.updateFcmToken);
usersRouter.put("/me/external-reminders", usersController.updateExternalReminders);

// Profile
usersRouter.get("/profile/me", usersController.getMyProfile);
usersRouter.put("/profile/me", usersController.updateMyProfile);
usersRouter.get("/managers", usersController.listManagers);

// Telegram link status — tells the frontend if the user has linked their Telegram
usersRouter.get("/me/telegram-status", async (req, res) => {
  try {
    const u = (req as any).user;
    const link = await prisma.telegramLink.findUnique({
      where: { userId: u.id },
      select: { telegramUsername: true, linkedAt: true, isActive: true },
    });
    const botName = process.env.TELEGRAM_BOT_USERNAME || "AtrailBot";
    res.json({
      ok: true,
      data: {
        linked: !!(link?.isActive),
        telegramUsername: link?.telegramUsername ?? null,
        linkedAt: link?.linkedAt ?? null,
        botName,
        linkUrl: `https://t.me/${botName}`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Link Telegram by Chat ID — user pastes the ID they got from /getid command
usersRouter.post("/me/telegram-link", async (req, res) => {
  try {
    const u = (req as any).user;
    const { telegramChatId } = req.body;

    if (!telegramChatId || isNaN(Number(telegramChatId))) {
      return res.status(400).json({ ok: false, message: "Invalid Telegram Chat ID" });
    }

    // Check if this chat ID is already used by another account
    const existing = await prisma.telegramLink.findUnique({
      where: { telegramChatId: String(telegramChatId) },
    });
    if (existing && existing.userId !== u.id) {
      return res.status(400).json({ ok: false, message: "This Telegram account is already linked to another user" });
    }

    // Get user info for welcome message
    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: { fullName: true, email: true, companyName: true, role: true },
    });

    // Upsert the link
    await prisma.telegramLink.upsert({
      where: { userId: u.id },
      update: { telegramChatId: String(telegramChatId), isActive: true, linkedAt: new Date(), lastSeenAt: new Date() },
      create: { userId: u.id, telegramChatId: String(telegramChatId), isActive: true },
    });

    // Send welcome message via bot
    const welcomeMsg =
      `🎉 *Welcome to Atrail, ${user?.fullName || "there"}!*\n\n` +
      `Your Telegram is now linked to your Atrail account.\n\n` +
      `📋 *Account Info:*\n` +
      `• Name: ${user?.fullName || "—"}\n` +
      `• Email: ${user?.email || "—"}\n` +
      `• Company: ${user?.companyName || "—"}\n` +
      `• Role: ${user?.role || "—"}\n\n` +
      `You'll now receive:\n` +
      `✅ Renewal alerts & reminders\n` +
      `✅ Task notifications\n` +
      `✅ Billing & system alerts\n\n` +
      `Type /menu to explore what I can do for you!`;

    try {
      await bot.telegram.sendMessage(String(telegramChatId), welcomeMsg, { parse_mode: "Markdown" });
    } catch (telegramErr: any) {
      // Don't fail the link if message sending fails — just log it
      console.error("[Telegram] Failed to send welcome message:", telegramErr?.message);
    }

    res.json({ ok: true, message: "Telegram linked successfully" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Unlink Telegram
usersRouter.delete("/me/telegram-link", async (req, res) => {
  try {
    const u = (req as any).user;
    await prisma.telegramLink.updateMany({
      where: { userId: u.id },
      data: { isActive: false },
    });
    res.json({ ok: true, message: "Telegram unlinked" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

