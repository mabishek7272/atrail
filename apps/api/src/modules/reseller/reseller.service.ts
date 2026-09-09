import { prisma } from "../../db.js";
import { ApiError } from "../../utils/errors.js";
import { Role } from "../../prisma-client.js";
import bcrypt from "bcryptjs";
import { sendEmailTo, welcomeEmailHtml } from "../notifications/email.js";

export const resellerService = {
  // List all resellers (GOD/DEVELOPER only)
  async listResellers() {
    return prisma.reseller.findMany({
      include: {
        owner: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
        createdBy: { select: { id: true, fullName: true } },
        organizations: { select: { id: true, name: true, billingStatus: true, orgType: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  // Create a reseller + its owner account (GOD/DEVELOPER only)
  async createReseller(data: {
    resellerName: string;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerOrgId: string; // the internal platform org
  }, createdById: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
    if (existing) throw new ApiError(400, "A user with this email already exists");

    const passwordHash = await bcrypt.hash(data.ownerPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          organizationId: data.ownerOrgId,
          fullName: data.ownerFullName,
          email: data.ownerEmail,
          passwordHash,
          role: Role.RESELLER_SUPER_ADMIN,
          isActive: true,
          status: "ACTIVE",
        },
        select: { id: true, fullName: true, email: true, role: true },
      });

      const reseller = await tx.reseller.create({
        data: {
          name: data.resellerName,
          ownerId: owner.id,
          createdById,
        },
        include: {
          owner: { select: { id: true, fullName: true, email: true, role: true } },
        },
      });

      return { reseller, owner };
    });

    sendEmailTo(
      data.ownerEmail,
      `Your ${data.resellerName} reseller account on Atrail`,
      welcomeEmailHtml({
        name: data.ownerFullName,
        orgName: data.resellerName,
        loginEmail: data.ownerEmail,
        tempPassword: data.ownerPassword,
      })
    ).catch(console.error);

    return result;
  },

  // Get a single reseller with its client orgs
  async getReseller(resellerId: string) {
    const r = await prisma.reseller.findUnique({
      where: { id: resellerId },
      include: {
        owner: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
        organizations: {
          include: {
            featureFlags: true,
            _count: { select: { users: true } },
          },
        },
      },
    });
    if (!r) throw new ApiError(404, "Reseller not found");
    return r;
  },

  // Create a client org under a reseller
  async createClientOrg(data: {
    orgName: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
    planName?: string;
    resellerId: string;
  }, createdById: string, createdByRole: string) {
    const existing = await prisma.organization.findUnique({ where: { name: data.orgName } });
    if (existing) throw new ApiError(400, "Organization name already taken");

    const emailExists = await prisma.user.findUnique({ where: { email: data.adminEmail } });
    if (emailExists) throw new ApiError(400, "Admin email already registered");

    const reseller = await prisma.reseller.findUnique({ where: { id: data.resellerId } });
    if (!reseller) throw new ApiError(404, "Reseller not found");

    const passwordHash = await bcrypt.hash(data.adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.orgName,
          orgType: "CLIENT",
          resellerId: data.resellerId,
          planName: data.planName ?? "Starter",
          billingStatus: "ACTIVE",
        },
      });

      // Create feature flags for the new org (all enabled by default)
      await tx.orgFeatureFlags.create({
        data: { organizationId: org.id },
      });

      const admin = await tx.user.create({
        data: {
          organizationId: org.id,
          fullName: data.adminFullName,
          email: data.adminEmail,
          passwordHash,
          role: Role.ADMIN,
          isActive: true,
          status: "ACTIVE",
        },
        select: { id: true, fullName: true, email: true, role: true },
      });

      return { org, admin };
    });

    sendEmailTo(
      data.adminEmail,
      `Your ${data.orgName} workspace on Atrail`,
      welcomeEmailHtml({
        name: data.adminFullName,
        orgName: data.orgName,
        loginEmail: data.adminEmail,
        tempPassword: data.adminPassword,
      })
    ).catch(console.error);

    return result;
  },

  // Get reseller by owner userId (for RESELLER_SUPER_ADMIN self-lookup)
  async getResellerByOwner(ownerId: string) {
    return prisma.reseller.findUnique({
      where: { ownerId },
      include: { organizations: { select: { id: true, name: true } } },
    });
  },

  // Update reseller info
  async updateReseller(resellerId: string, data: { name?: string }) {
    return prisma.reseller.update({
      where: { id: resellerId },
      data,
      include: { owner: { select: { id: true, fullName: true, email: true } } },
    });
  },
};
