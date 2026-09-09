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

    (req as any).user = {
      id:             payload.sub,
      orgId:          payload.orgId,
      organizationId: payload.orgId,
      role:           dbUser.role,   // always use live DB role, never trust token
    };

    // Set PostgreSQL RLS context
    if (payload.orgId) {
      await prisma.$executeRawUnsafe(
        `SELECT set_config('app.current_org_id', $1, FALSE)`,
        payload.orgId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `SELECT set_config('app.current_org_id', '', FALSE)`
      );
    }

    next();
  } catch {
    next(new ApiError(401, "Invalid or expired access token"));
  }
};

/** ----------------------------------------------------------------
 *  requireRole — RBAC guard with tenant validation
 * ---------------------------------------------------------------- */
// GOD can do anything, DEVELOPER can do anything except GOD-only routes
const ROLE_HIERARCHY: Record<string, number> = {
  GOD:                  100,
  DEVELOPER:            90,
  RESELLER_SUPER_ADMIN: 80,
  ADMIN:                70,
  ELITE:                60,
  USER:                 40,
  INTERN:               30,
};

export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    const user = (req as any).user;
    if (!user) return next(new ApiError(401, "Unauthorized"));

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;

    // GOD/DEVELOPER bypass all org-level role checks
    if (userLevel >= ROLE_HIERARCHY.DEVELOPER) return next();

    if (!roles.includes(user.role)) return next(new ApiError(403, "Forbidden"));

    // If the route has an :orgId param, verify it matches the user's org
    const paramOrgId = (req.params as any).orgId;
    if (paramOrgId && paramOrgId !== user.orgId) {
      return next(new ApiError(403, "Organization mismatch"));
    }
    next();
  };

export const requireGodOrDeveloper: RequestHandler = (req, _res, next) => {
  const user = (req as any).user;
  if (!user) return next(new ApiError(401, "Unauthorized"));
  const level = ROLE_HIERARCHY[user.role] ?? 0;
  if (level < ROLE_HIERARCHY.DEVELOPER) return next(new ApiError(403, "Forbidden: requires DEVELOPER or GOD role"));
  next();
};
