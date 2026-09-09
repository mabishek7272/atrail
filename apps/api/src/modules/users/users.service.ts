import { prisma } from "../../db.js";
import { ApiError } from "../../utils/errors.js";
import { canMessage } from "@amgi/shared";
import { UserStatus, Role, Gender } from "../../prisma-client.js";
import bcrypt from "bcryptjs";
import { hrService } from "../hr/hr.service.js";
import { sendEmailToUser, sendEmailTo, welcomeEmailHtml } from "../notifications/email.js";
import { sendTelegramNotification } from "../telegram/notify.js";
import { canAssignRole } from "../../middlewares/rbac.js";

export const usersService = {
  async createUser(data: any, orgId: string, actorRole: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ApiError(400, "User with this email already exists");

    const validRoles = Object.values(Role);
    if (!validRoles.includes(data.role as any)) throw new ApiError(400, "Invalid role specified");

    if (!canAssignRole(actorRole, data.role)) {
      throw new ApiError(403, `Your role (${actorRole}) cannot assign the role: ${data.role}`);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        fullName: data.fullName,
        email: data.email,
        passwordHash,
        role: data.role as Role,
        companyName: data.companyName,
        phone: data.phone,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
      select: { id: true, fullName: true, email: true, role: true },
    });

    await hrService.allocateDefaultLeaveBalances(user.id);

    sendEmailTo(
      data.email,
      `Your Atrail account is ready`,
      welcomeEmailHtml({
        name: data.fullName,
        orgName: data.companyName || "your organization",
        loginEmail: data.email,
        tempPassword: data.password,
      })
    ).catch(console.error);

    return user;
  },

  async changeRole(actorId: string, actorRole: string, targetUserId: string, newRole: string, orgId: string) {
    if (actorId === targetUserId) throw new ApiError(400, "Cannot change your own role");
    
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId: orgId }
    });
    if (!target) throw new ApiError(404, "User not found");

    const validRoles = Object.values(Role);
    if (!validRoles.includes(newRole as any)) throw new ApiError(400, "Invalid role specified");

    if (!canAssignRole(actorRole, newRole)) {
      throw new ApiError(403, `Your role (${actorRole}) cannot assign the role: ${newRole}`);
    }

    return prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole as Role },
      select: { id: true, fullName: true, email: true, role: true }
    });
  },

  async listMessagable(userId: string, orgId: string) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, organizationId: true },
    });
    if (!me || me.organizationId !== orgId)
      throw new ApiError(401, "Unauthorized");

    const users = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
    });

    return users
      .filter((u) => u.id !== userId)
      .filter((u) => canMessage(me.role as any, u.role as any))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  },

  async listAll(actorId: string, actorRole: string, orgId: string, allOrgs: boolean = false) {
    const isPlatformOwner = actorRole === "GOD" || actorRole === "DEVELOPER";
    let where: any = { isActive: true };

    if (isPlatformOwner) {
      if (!allOrgs) {
        where.organizationId = orgId;
      }
    } else if (actorRole === "RESELLER_SUPER_ADMIN") {
      const reseller = await prisma.reseller.findUnique({ where: { ownerId: actorId } });
      if (!reseller) return [];

      if (allOrgs) {
        where.organization = { resellerId: reseller.id };
      } else {
        const org = await prisma.organization.findFirst({
          where: { id: orgId, resellerId: reseller.id }
        });
        if (!org) throw new ApiError(403, "Forbidden: Organization does not belong to your reseller");
        where.organizationId = orgId;
      }
    } else {
      where.organizationId = orgId;
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
        organizationId: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async listPending(orgId: string) {
    return prisma.user.findMany({
      where: { organizationId: orgId, status: UserStatus.PENDING },
      select: {
        id: true,
        fullName: true,
        email: true,
        companyName: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async approveUser(userId: string, orgId: string, role: string, actorRole: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
    });
    if (!user) throw new ApiError(404, "User not found");
    if (user.status !== UserStatus.PENDING)
      throw new ApiError(400, "User is not in PENDING status");

    const validRoles = Object.values(Role);
    if (!validRoles.includes(role as any))
      throw new ApiError(400, "Invalid role specified");

    // Strictly enforce Role assignment Hierarchy
    if (actorRole === "RESELLER_SUPER_ADMIN") {
      // Can assign anything
    } else if (actorRole === "ADMIN") {
      if (role !== "ELITE" && role !== "USER") {
        throw new ApiError(403, "Admins can only assign ELITE and USER roles");
      }
    } else if (actorRole === "ELITE") {
      if (role !== "INTERN" && role !== "USER") {
        throw new ApiError(403, "Elites can only assign INTERN and USER roles");
      }
    } else {
      throw new ApiError(403, "You do not have permission to approve users");
    }

    const userUpdate = await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        role: role as Role,
        isActive: true,
      },
    });

    await hrService.allocateDefaultLeaveBalances(userUpdate.id);

    // Welcome email + Telegram on approval
    const firstName = userUpdate.fullName?.split(" ")[0] || "there";
    sendEmailToUser(
      userUpdate.id,
      "🎉 Welcome to Atrail — Your account is approved!",
      `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#020b18;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#00d4ff;margin-bottom:8px">🎉 Welcome to Atrail, ${firstName}!</h2>
        <p style="color:#94a3b8">Your account has been approved and is now active.</p>
        <table style="width:100%;margin:20px 0;border-collapse:collapse">
          <tr><td style="color:#64748b;padding:6px 0">Role</td><td style="color:#e2e8f0;font-weight:bold">${userUpdate.role}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0">Email</td><td style="color:#e2e8f0">${userUpdate.email}</td></tr>
        </table>
        <a href="https://atrail.in/login" style="display:inline-block;padding:12px 28px;background:#00d4ff;color:#020b18;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:8px">Login to Atrail →</a>
        <hr style="border-color:#1e3a5f;margin:24px 0"/>
        <p style="color:#374151;font-size:12px">Atrail Enterprise Platform · atrail.in</p>
      </div>
      `
    ).catch(console.error);

    sendTelegramNotification(
      userUpdate.id,
      `🎉 *Welcome to Atrail, ${firstName}!*\n\nYour account has been approved.\n\n• Role: ${userUpdate.role}\n• Email: ${userUpdate.email}\n\nLogin at atrail.in and complete your profile setup.`
    ).catch(console.error);

    return userUpdate;
  },

  // Admin/Super Admin can view all users grouped by role and project assignment
  async listOrgDirectory(orgId: string) {
    const users = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        phone: true,
        companyName: true,
        status: true,
        createdAt: true,
        projectMembers: {
          select: {
            role: true,
            project: { select: { id: true, name: true } }
          }
        },
        headedProjects: {
          select: { id: true, name: true }
        },
        reportsTo: {
          select: { id: true, fullName: true, role: true }
        },
        accessibleOrgs: {
          select: {
            organizationId: true,
            organization: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }]
    });

    // Group by role for structured display
    const grouped: Record<string, typeof users> = {};
    for (const user of users) {
      const roleKey = user.role as string;
      if (!grouped[roleKey]) grouped[roleKey] = [];
      grouped[roleKey].push(user);
    }

    return { users, grouped };
  },

  // Update who a user reports to (Elite assigns users; Admin assigns Elites)
  async assignReportsTo(actorId: string, targetUserId: string, reportsToId: string, orgId: string) {
    const [actor, target, reportsTo] = await Promise.all([
      prisma.user.findUnique({ where: { id: actorId }, select: { role: true, organizationId: true } }),
      prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true, organizationId: true } }),
      prisma.user.findUnique({ where: { id: reportsToId }, select: { role: true, organizationId: true } }),
    ]);

    if (!actor || actor.organizationId !== orgId) throw new ApiError(401, "Unauthorized");
    if (!target || target.organizationId !== orgId) throw new ApiError(404, "Target user not found");
    if (!reportsTo || reportsTo.organizationId !== orgId) throw new ApiError(404, "Reporting user not found");

    if (actor.role === "RESELLER_SUPER_ADMIN") {
      // Super Admin can do anything
    } else if (actor.role === "ADMIN") {
      if (target.role !== "ELITE" && target.role !== "USER" && target.role !== "INTERN") {
        throw new ApiError(403, "Admins can only assign Elites, Users, or Interns");
      }
    } else if (actor.role === "ELITE") {
      if (target.role !== "USER" && target.role !== "INTERN") throw new ApiError(403, "Elites can only assign Interns or Users");
    } else {
      throw new ApiError(403, "Insufficient permissions to assign reports");
    }

    return prisma.user.update({
      where: { id: targetUserId },
      data: { reportsToId: reportsToId },
      select: { id: true, fullName: true, role: true, reportsToId: true }
    });
  },

  async updateFcmToken(userId: string, token: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
      select: { id: true, fcmToken: true }
    });
  },

  async updateExternalReminders(userId: string, enabled: boolean) {
    return prisma.user.update({
      where: { id: userId },
      data: { externalReminders: enabled },
      select: { id: true, externalReminders: true }
    });
  },

  async getMyProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        reportsTo: { select: { id: true, fullName: true, role: true } },
        skills: { include: { skill: true } }
      }
    });
    if (!user) throw new ApiError(404, "User not found");

    const isComplete = !!(
      user.fullName &&
      user.phone &&
      user.profile?.gender &&
      user.dob &&
      user.companyName &&
      user.profile?.department &&
      user.skills.length > 0 &&
      (["GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN", "ADMIN", "USER"].includes(user.role) || user.reportsToId)
    );

    return {
      user,
      isComplete
    };
  },

  async updateMyProfile(userId: string, data: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");

    const { fullName, gender, dob, companyName, department, reportsToId, skills, phone, personalEmail } = data;

    // Update main User fields (excluding role/email/status for security)
    await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: fullName || undefined,
        dob: dob ? new Date(dob) : undefined,
        companyName: companyName || undefined,
        reportsToId: reportsToId || undefined,
        phone: phone || undefined,
      }
    });

    // Update Profile (department / team name, gender)
    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        department:    department    || undefined,
        gender:        gender as Gender || undefined,
        personalEmail: personalEmail || undefined,
      },
      create: {
        userId,
        department:    department    || "",
        gender:        gender as Gender || "PREFER_NOT_TO_SAY",
        personalEmail: personalEmail || undefined,
      }
    });

    // Sync Skills
    if (Array.isArray(skills)) {
      await prisma.userSkill.deleteMany({ where: { userId } });
      for (const skillName of skills) {
        if (!skillName || typeof skillName !== "string") continue;
        const normalized = skillName.trim();
        if (!normalized) continue;

        let skill = await prisma.skill.findFirst({
          where: { name: normalized, organizationId: user.organizationId }
        });
        if (!skill) {
          skill = await prisma.skill.create({
            data: { name: normalized, organizationId: user.organizationId }
          });
        }
        await prisma.userSkill.create({
          data: { userId, skillId: skill.id, proficiencyLevel: 3 }
        });
      }
    }

    return this.getMyProfile(userId);
  },

  async listManagers(userId: string, orgId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");

    let allowedRoles: Role[] = [];
    if (user.role === "USER" || user.role === "INTERN") {
      allowedRoles = ["ELITE", "ADMIN", "RESELLER_SUPER_ADMIN"];
    } else if (user.role === "ELITE") {
      allowedRoles = ["ADMIN", "RESELLER_SUPER_ADMIN"];
    } else {
      allowedRoles = []; // Admins/Super Admins don't select a manager
    }

    return prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        role: { in: allowedRoles },
        id: { not: userId }
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        email: true
      },
      orderBy: { fullName: "asc" }
    });
  },

  async updateUser(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    data: {
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      organizationId?: string;
      accessibleOrgIds?: string[];
    },
    orgId: string
  ) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { accessibleOrgs: true, organization: true }
    });
    if (!target) throw new ApiError(404, "User not found");

    const isPlatformOwner = actorRole === "GOD" || actorRole === "DEVELOPER";

    if (!isPlatformOwner) {
      if (actorRole === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: actorId } });
        if (!reseller || target.organization.resellerId !== reseller.id) {
          throw new ApiError(403, "Forbidden: Cannot edit user from another reseller's tenant");
        }
      } else if (actorRole === "ADMIN") {
        if (target.organizationId !== orgId) {
          throw new ApiError(403, "Forbidden: User is in another organization");
        }
      } else {
        throw new ApiError(403, "Forbidden: Insufficient permissions to edit users");
      }
    }

    if (data.role && data.role !== target.role) {
      const validRoles = Object.values(Role);
      if (!validRoles.includes(data.role as any)) throw new ApiError(400, "Invalid role specified");

      if (isPlatformOwner) {
        // Platform owners can set any role
      } else if (actorRole === "RESELLER_SUPER_ADMIN") {
        if (data.role === "GOD" || data.role === "DEVELOPER") {
          throw new ApiError(403, "Resellers cannot assign Platform Owner roles");
        }
      } else if (actorRole === "ADMIN") {
        if (target.role === "RESELLER_SUPER_ADMIN" || target.role === "ADMIN") {
          throw new ApiError(403, "Admins cannot change roles of Reseller Admins or other Admins");
        }
        if (data.role === "RESELLER_SUPER_ADMIN" || data.role === "ADMIN" || data.role === "GOD" || data.role === "DEVELOPER") {
          throw new ApiError(403, "Admins can only assign ELITE, USER, or INTERN roles");
        }
      } else if (actorRole === "ELITE") {
        if (target.role !== "USER" && target.role !== "INTERN") {
          throw new ApiError(403, "Elites can only change roles of Users and Interns");
        }
        if (data.role !== "USER" && data.role !== "INTERN") {
          throw new ApiError(403, "Elites can only assign USER or INTERN roles");
        }
      } else {
        throw new ApiError(403, "Insufficient permissions to change roles");
      }
    }

    const updateData: any = {};
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.email !== undefined) {
      if (data.email !== target.email) {
        const existing = await prisma.user.findUnique({ where: { email: data.email } });
        if (existing) throw new ApiError(400, "Email already registered to another user");
      }
      updateData.email = data.email;
    }
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.role !== undefined) updateData.role = data.role as Role;
    
    if (data.organizationId !== undefined) {
      if (data.organizationId !== target.organizationId) {
        const destOrg = await prisma.organization.findUnique({ where: { id: data.organizationId } });
        if (!destOrg) throw new ApiError(404, "Destination organization not found");
      }
      updateData.organizationId = data.organizationId;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: updateData,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          organizationId: true,
        }
      });

      if (data.accessibleOrgIds !== undefined) {
        await tx.userOrganization.deleteMany({
          where: { userId: targetUserId }
        });

        if (data.accessibleOrgIds.length > 0) {
          await tx.userOrganization.createMany({
            data: data.accessibleOrgIds.map(orgId => ({
              userId: targetUserId,
              organizationId: orgId
            }))
          });
        }
      }

      return user;
    });

    return updatedUser;
  },

  async deleteUser(actorId: string, actorRole: string, actorOrgId: string, targetUserId: string) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { organization: true },
    });
    
    if (!target) throw new ApiError(404, "User not found");
    
    const isPlatformOwner = actorRole === "GOD" || actorRole === "DEVELOPER";
    
    if (!isPlatformOwner) {
      if (actorRole === "RESELLER_SUPER_ADMIN") {
        const reseller = await prisma.reseller.findUnique({ where: { ownerId: actorId } });
        if (!reseller || target.organization.resellerId !== reseller.id) {
          throw new ApiError(403, "Forbidden: Cannot delete user from another reseller's tenant");
        }
      } else if (actorRole === "ADMIN") {
        if (target.organizationId !== actorOrgId) {
          throw new ApiError(403, "Forbidden: Cannot delete user from another organization");
        }
      } else {
        throw new ApiError(403, "Forbidden: Insufficient permissions to delete users");
      }
    }

    // Soft delete to preserve chat history and project integrity
    return prisma.user.update({
      where: { id: targetUserId },
      data: {
        isActive: false,
        status: "REJECTED"
      },
    });
  }
};

