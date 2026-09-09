import { prisma } from "../../db.js";
import { ApiError } from "../../utils/errors.js";

const ALL_FLAGS = [
  "projects", "tasks", "kanban", "calendar", "chat", "notices",
  "attendance", "hr", "assets", "licenses", "finance", "renewals",
  "customers", "commissions", "analytics", "emergency", "documents",
  "integrations", "aiAssistant", "telegram",
] as const;

export type FeatureFlagKey = typeof ALL_FLAGS[number];

export const featureFlagsService = {
  async getFlags(orgId: string) {
    let flags = await prisma.orgFeatureFlags.findUnique({ where: { organizationId: orgId } });
    if (!flags) {
      // Auto-create with all features enabled
      flags = await prisma.orgFeatureFlags.create({ data: { organizationId: orgId } });
    }
    return flags;
  },

  async updateFlags(orgId: string, updates: Partial<Record<FeatureFlagKey, boolean>>) {
    // Validate keys
    const invalidKeys = Object.keys(updates).filter(k => !ALL_FLAGS.includes(k as any));
    if (invalidKeys.length) throw new ApiError(400, `Invalid feature flag keys: ${invalidKeys.join(", ")}`);

    const flags = await prisma.orgFeatureFlags.upsert({
      where: { organizationId: orgId },
      update: updates,
      create: { organizationId: orgId, ...updates },
    });
    return flags;
  },

  // Called when a new org is created — ensures flags row exists
  async ensureFlags(orgId: string) {
    return prisma.orgFeatureFlags.upsert({
      where: { organizationId: orgId },
      update: {},
      create: { organizationId: orgId },
    });
  },
};
