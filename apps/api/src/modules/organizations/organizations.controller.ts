import { Request, Response } from "express";
import { prisma } from "../../db.js";
import { z } from "zod";

export const organizationsController = {
  async list(req: Request, res: Response) {
    try {
      const u = (req as any).user;
      let where: any = {};

      if (u.role === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: u.id } });
        if (!reseller) {
          return res.json({ ok: true, organizations: [] });
        }
        where.resellerId = reseller.id;
      } else if (u.role !== "GOD" && u.role !== "DEVELOPER") {
        where.id = u.orgId;
      }

      const orgs = await prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          reseller: { select: { name: true } },
          _count: {
            select: { users: true, projects: true },
          },
        },
      });
      res.json({ ok: true, organizations: orgs });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const u = (req as any).user;
      const schema = z.object({
        name: z.string().min(2),
        orgType: z.enum(["INTERNAL", "RESELLER", "CLIENT"]).optional(),
        planName: z.string().optional(),
        resellerId: z.string().optional(),
        // Optional admin user to create alongside the org
        adminFullName: z.string().optional(),
        adminEmail: z.string().email().optional(),
        adminPassword: z.string().min(6).optional(),
      });
      const parsed = schema.parse(req.body);

      let targetResellerId = parsed.resellerId;
      let targetOrgType = parsed.orgType ?? "INTERNAL";

      if (u.role === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: u.id } });
        if (!reseller) return res.status(403).json({ ok: false, message: "No reseller found for this account" });
        targetResellerId = reseller.id;
        targetOrgType = "CLIENT";
      }

      const existing = await prisma.organization.findUnique({ where: { name: parsed.name } });
      if (existing) return res.status(400).json({ ok: false, message: "Organization name already taken" });

      if (parsed.adminEmail) {
        const emailTaken = await prisma.user.findUnique({ where: { email: parsed.adminEmail } });
        if (emailTaken) return res.status(400).json({ ok: false, message: "Admin email already registered" });
      }

      const bcrypt = await import("bcryptjs");
      const { welcomeEmailHtml, sendEmailTo } = await import("../notifications/email.js");

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: parsed.name,
            orgType: targetOrgType,
            planName: parsed.planName ?? "Starter",
            resellerId: targetResellerId ?? null,
          },
        });

        // Always create feature flags (all on by default)
        await tx.orgFeatureFlags.create({ data: { organizationId: org.id } });

        let admin = null;
        if (parsed.adminFullName && parsed.adminEmail && parsed.adminPassword) {
          const passwordHash = await bcrypt.hash(parsed.adminPassword, 12);
          admin = await tx.user.create({
            data: {
              organizationId: org.id,
              fullName: parsed.adminFullName,
              email: parsed.adminEmail,
              passwordHash,
              role: "ADMIN",
              isActive: true,
              status: "ACTIVE",
            },
            select: { id: true, fullName: true, email: true, role: true },
          });
        }

        return { org, admin };
      });

      if (result.admin && parsed.adminEmail && parsed.adminPassword) {
        sendEmailTo(
          parsed.adminEmail,
          `Your ${parsed.name} workspace on Atrail`,
          welcomeEmailHtml({
            name: parsed.adminFullName ?? "Admin",
            orgName: parsed.name,
            loginEmail: parsed.adminEmail,
            tempPassword: parsed.adminPassword,
          })
        ).catch(console.error);
      }

      res.status(201).json({ ok: true, organization: result.org, admin: result.admin });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ ok: false, message: err.errors[0]?.message ?? "Invalid input" });
      } else {
        res.status(500).json({ ok: false, message: err.message });
      }
    }
  },

  async update(req: Request, res: Response) {
    try {
      const u = (req as any).user;
      const { id } = req.params;

      if (u.role === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: u.id } });
        const org = await prisma.organization.findFirst({
          where: { id, resellerId: reseller?.id ?? "non-existent" }
        });
        if (!org) return res.status(403).json({ ok: false, message: "Forbidden" });
      } else if (u.role !== "GOD" && u.role !== "DEVELOPER") {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }

      const schema = z.object({
        name: z.string().min(2).optional(),
        logoUrl: z.string().url().optional().nullable(),
        orgType: z.enum(["INTERNAL", "RESELLER", "CLIENT"]).optional(),
      });
      const parsed = schema.parse(req.body);

      // Resellers cannot change organization type
      if (u.role === "RESELLER_SUPER_ADMIN" && parsed.orgType) {
        delete parsed.orgType;
      }

      const org = await prisma.organization.update({
        where: { id },
        data: parsed,
      });

      res.json({ ok: true, organization: org });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ ok: false, message: "Invalid input" });
      } else {
        res.status(500).json({ ok: false, message: err.message });
      }
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const u = (req as any).user;
      const { id } = req.params;

      if (u.role === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: u.id } });
        const org = await prisma.organization.findFirst({
          where: { id, resellerId: reseller?.id ?? "non-existent" }
        });
        if (!org) return res.status(403).json({ ok: false, message: "Forbidden" });
      } else if (u.role !== "GOD" && u.role !== "DEVELOPER") {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }

      // Prevent deleting the organization if there are users other than possible seed users or depending on strictness
      const usersCount = await prisma.user.count({ where: { organizationId: id } });
      if (usersCount > 0) {
        return res.status(400).json({ ok: false, message: "Cannot delete organization with active users. Please remove them first." });
      }

      await prisma.organization.delete({
        where: { id },
      });

      res.json({ ok: true, deleted: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  },
};
