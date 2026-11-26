import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ApiError } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { redis } from "../redis.js";
import { prisma } from "../db.js";

const MAX_ATTEMPTS = 5;            // Max failed attempts before lockout
const LOCKOUT_SEC  = 5 * 60;       // 5 minutes lockout

export async function checkLoginBruteForce(key: string): Promise<void> {
  // TEMPORARILY DISABLED FOR TESTING - Re-enable after debugging
  return;
  // const attemptsStr = await redis.get(`bf:${key}`);
  // if (!attemptsStr) return;

  // const attempts = parseInt(attemptsStr, 10);
  // if (attempts >= MAX_ATTEMPTS) {
  //   const ttl = await redis.ttl(`bf:${key}`);
  //   const waitMin = Math.ceil(ttl / 60);
  //   throw new ApiError(429, `Too many failed attempts. Try again in ${waitMin} minute(s).`);
  // }
}

export async function recordLoginAttempt(key: string, success: boolean): Promise<void> {
  const redisKey = `bf:${key}`;
  if (success) {
    await redis.del(redisKey);
    return;
  }

  const attempts = await redis.incr(redisKey);
  if (attempts === 1) {
    await redis.expire(redisKey, LOCKOUT_SEC);
  } else if (attempts >= MAX_ATTEMPTS) {
    await redis.expire(redisKey, LOCKOUT_SEC);
  }
}

/** ----------------------------------------------------------------
 *  requireAuth — verifies Bearer or Cookie access token
 * ---------------------------------------------------------------- */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  let token = req.cookies?.accessToken;

  if (!token) {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      token = header.slice("Bearer ".length);
    }
  }

  if (!token) {
    return next(new ApiError(401, "Missing access token"));
  }

  try {
    const payload = verifyAccessToken(token);

    // Fetch live role + email from DB so a stale token can't hold a GOD role
    // that was revoked, and so we can enforce GOD_EMAILS guard.
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, email: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
      return next(new ApiError(401, "Account inactive or not found"));
    }

    // GOD role is only valid for the two hardcoded emails
    const { GOD_EMAILS } = await import("./rbac.js");
    if (dbUser.role === "GOD" && !GOD_EMAILS.has(dbUser.email)) {
      return next(new ApiError(403, "GOD role not authorised for this account"));
    }

    // scope/resellerId are additive signals on top of orgId — see jwt.ts
    // for why orgId itself always stays a concrete value. Re-validate scope
    // against the LIVE role (not the token's) so a demoted GOD/DEVELOPER or
    // RESELLER_SUPER_ADMIN can't keep an elevated scope for the life of an
    // already-issued access token.
    let scope: "SINGLE_ORG" | "ALL_ORGS" | "RESELLER_ORGS" = payload.scope ?? "SINGLE_ORG";
    if (scope === "ALL_ORGS" && dbUser.role !== "GOD" && dbUser.role !== "DEVELOPER") {
      scope = "SINGLE_ORG";
    }
    if (scope === "RESELLER_ORGS" && dbUser.role !== "RESELLER_SUPER_ADMIN") {
      scope = "SINGLE_ORG";
    }

    (req as any).user = {
      id:             payload.sub,
      orgId:          payload.orgId,
      organizationId: payload.orgId,
      role:           dbUser.role,   // always use live DB role, never trust token
      scope,
      resellerId:     scope === "RESELLER_ORGS" ? payload.resellerId : null,
    };

    // Set PostgreSQL RLS context. orgId is always set (see jwt.ts) so
    // non-RLS tables' app-level `where: { organizationId }` filters are
    // completely unaffected by scope. scope only changes what's layered on
    // top for the 11 RLS-covered tables (security_hardening migration):
    //   ALL_ORGS      -> current_org_id cleared entirely (real bypass)
    //   RESELLER_ORGS -> current_org_id stays set, PLUS current_reseller_id
    //                    is set so the reseller-wide policy disjunct fires
    //   SINGLE_ORG    -> current_org_id set, current_reseller_id cleared
    if (scope === "ALL_ORGS") {
      await prisma.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '', FALSE)`);
      await prisma.$executeRawUnsafe(`SELECT set_config('app.current_reseller_id', '', FALSE)`);
    } else if (payload.orgId) {
      await prisma.$executeRawUnsafe(`SELECT set_config('app.current_org_id', $1, FALSE)`, payload.orgId);
      await prisma.$executeRawUnsafe(
        `SELECT set_config('app.current_reseller_id', $1, FALSE)`,
        scope === "RESELLER_ORGS" && payload.resellerId ? payload.resellerId : ""
      );
    } else {
      // No orgId and not an explicit ALL_ORGS scope — this should not
      // happen with any code path that mints tokens today (orgId is always
      // set), so fail closed rather than silently falling through to an
      // RLS bypass the way the old code did.
      return next(new ApiError(401, "Token missing organization context"));
    }

    next();
  } catch {
    next(new ApiError(401, "Invalid or expired access token"));
  }
};

/** ----------------------------------------------------------------
 *  requireRole — re-exported from rbac.ts (single source of truth)
 * ----------------------------------------------------------------
 *  Previously this file defined its OWN requireRole with its own weight
 *  table (ROLE_HIERARCHY: GOD 100/DEVELOPER 90/.../INTERN 30) that did an
 *  exact-role match for anyone below DEVELOPER, while rbac.ts separately
 *  defined a real weight-based requireRole (GOD 200/DEVELOPER 190/.../
 *  INTERN 30) used only by the renewals module. Having two differently-
 *  scaled, differently-behaving implementations of the same exported name
 *  was a real bug source (routes had to manually enumerate every allowed
 *  role instead of relying on hierarchy). rbac.ts's version is now the
 *  only implementation; this re-export keeps every existing
 *  `import { requireAuth, requireRole } from ".../middlewares/auth.js"`
 *  call site working with zero changes.
 * ---------------------------------------------------------------- */
export { requireRole, requireGod, requireResellerOrAbove } from "./rbac.js";
