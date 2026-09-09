import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ApiError } from "../utils/errors.js";

// ─── Role Hierarchy ───────────────────────────────────────────────────────────
// Three tiers:
//   Platform  : GOD (200), DEVELOPER (190)
//   Reseller  : RESELLER_SUPER_ADMIN (150)
//   Client Org: ADMIN (100), ELITE (80), USER (70), INTERN (30)

export const ROLE_WEIGHTS: Record<string, number> = {
  GOD:                   200,
  DEVELOPER:             190,
  RESELLER_SUPER_ADMIN:  150,
  ADMIN:                 100,
  ELITE:                 80,
  USER:                  70,
  INTERN:                30,
};

// GOD-hardcoded emails — only these can ever be GOD
export const GOD_EMAILS = new Set([
  "arunkumar.anr@gmail.com",
  "m.abishek7272@gmail.com",
]);

// Roles that ONLY a GOD user can assign
export const GOD_ONLY_ASSIGNABLE = new Set(["GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN"]);

// Roles that GOD or RESELLER_SUPER_ADMIN can assign (to create client org admins)
export const RESELLER_ASSIGNABLE = new Set(["ADMIN", "ELITE", "USER", "INTERN"]);

// ─── Middleware factories ─────────────────────────────────────────────────────

export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return next(new ApiError(401, "Unauthorized"));

    const weight = ROLE_WEIGHTS[user.role] ?? 0;
    const minRequired = Math.min(...roles.map((r) => ROLE_WEIGHTS[r] ?? 999));

    if (weight >= minRequired) return next();
    return next(new ApiError(403, `Requires one of: ${roles.join(", ")}`));
  };
}

export function requireGod(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return next(new ApiError(401, "Unauthorized"));
    if (user.role !== "GOD" && user.role !== "DEVELOPER") {
      return next(new ApiError(403, "Platform-level access only"));
    }
    next();
  };
}

export function requireResellerOrAbove(): RequestHandler {
  return requireRole("RESELLER_SUPER_ADMIN", "DEVELOPER", "GOD");
}

// ─── Role-assignment guard ────────────────────────────────────────────────────

export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (GOD_ONLY_ASSIGNABLE.has(targetRole)) {
    return actorRole === "GOD" || actorRole === "DEVELOPER";
  }
  if (targetRole === "ADMIN") {
    return ROLE_WEIGHTS[actorRole] >= ROLE_WEIGHTS["RESELLER_SUPER_ADMIN"];
  }
  if (targetRole === "ELITE") {
    return ROLE_WEIGHTS[actorRole] >= ROLE_WEIGHTS["ADMIN"];
  }
  if (targetRole === "USER" || targetRole === "INTERN") {
    return ROLE_WEIGHTS[actorRole] >= ROLE_WEIGHTS["ELITE"];
  }
  return false;
}

// ─── Org context guard ────────────────────────────────────────────────────────

export function validateOrgContext(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const requestOrgId = req.params.orgId || req.body?.organizationId || (req as any).query?.orgId;

    if (!user) return next(new ApiError(401, "Unauthorized"));

    // GOD and DEVELOPER can operate on any org
    if (user.role === "GOD" || user.role === "DEVELOPER") return next();

    if (requestOrgId && requestOrgId !== user.orgId) {
      return next(new ApiError(403, "Organization mismatch"));
    }
    next();
  };
}

// ─── Legacy: RenewalOSRole enum (kept for renewals routes) ───────────────────
export enum RenewalOSRole {
  ORG_OWNER        = "ORG_OWNER",
  ORG_ADMIN        = "ORG_ADMIN",
  SALES_MANAGER    = "SALES_MANAGER",
  ACCOUNT_MANAGER  = "ACCOUNT_MANAGER",
  FINANCE          = "FINANCE",
  READ_ONLY        = "READ_ONLY",
  EXTERNAL_CUSTOMER = "EXTERNAL_CUSTOMER",
}

// ─── Legacy aliases (kept for routes that haven't been updated yet) ───────────

export function requireRoles(...roles: string[]): RequestHandler {
  return requireRole(...roles);
}

export function canAccessResource(userRole: string, resourceOwnerId: string, userId: string): boolean {
  if ((ROLE_WEIGHTS[userRole] ?? 0) >= ROLE_WEIGHTS["ADMIN"]) return true;
  return resourceOwnerId === userId;
}

export function getPermissionsForRole(role: string): string[] {
  const weight = ROLE_WEIGHTS[role] ?? 0;
  const all = [
    "manage_billing", "manage_organization", "delete_organization",
    "manage_users", "view_all_data", "edit_all_renewals", "manage_commissions",
    "manage_integrations", "manage_masters", "view_all_pipelines",
    "reassign_accounts", "run_reports", "view_all_renewals", "edit_team_renewals",
    "view_commissions", "manage_own_customers", "execute_renewals", "create_quotes",
    "close_deals", "view_own_renewals", "request_payout", "view_own_commissions",
    "view_payments", "view_invoices", "manage_ar", "reconcile_commissions",
    "view_dso_reports", "view_financial_reports",
  ];

  if (weight >= ROLE_WEIGHTS["GOD"])                  return all;
  if (weight >= ROLE_WEIGHTS["RESELLER_SUPER_ADMIN"]) return all.filter(p => p !== "delete_organization");
  if (weight >= ROLE_WEIGHTS["ADMIN"])
    return ["manage_users", "manage_integrations", "manage_masters", "view_all_data",
            "edit_all_renewals", "manage_commissions", "view_all_pipelines",
            "run_reports", "view_all_renewals"];
  if (weight >= ROLE_WEIGHTS["ELITE"])
    return ["view_all_pipelines", "reassign_accounts", "run_reports",
            "view_all_renewals", "edit_team_renewals", "view_commissions"];
  if (weight >= ROLE_WEIGHTS["USER"])
    return ["manage_own_customers", "execute_renewals", "create_quotes",
            "close_deals", "view_own_renewals", "request_payout", "view_own_commissions"];
  return ["view_own_renewals"];
}

export function roleBasedDataFilter(userRole: string, data: any[]): any[] {
  if ((ROLE_WEIGHTS[userRole] ?? 0) >= ROLE_WEIGHTS["ADMIN"]) return data;
  return data;
}
