import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { Role } from "../generated/client/index.js";

// `scope` is an ADDITIVE signal on top of `orgId` — it never replaces it.
// orgId stays a real, concrete organization id in every case (home org, or
// whatever org was last explicitly switched to) so that the many
// controllers which filter by `where: { organizationId: user.orgId }` at
// the application layer (most tables — only 11 are under Postgres RLS,
// see the security_hardening migration) keep working completely unchanged
// no matter what scope is active. `scope` only tells requireAuth what to
// additionally set as RLS session variables:
//   SINGLE_ORG    — (default) requireAuth sets app.current_org_id = orgId.
//                   RLS-covered tables are scoped to exactly that org.
//   ALL_ORGS      — GOD/DEVELOPER only (opt-in via POST /auth/scope).
//                   requireAuth sets app.current_org_id = '' (→ NULL),
//                   lifting RLS restriction entirely on the 11 covered
//                   tables. orgId itself is untouched, so non-RLS tables
//                   still filter by the user's real home org — a known,
//                   documented limit of this phase (see Phase 5 in the
//                   architecture plan for extending coverage).
//   RESELLER_ORGS — RESELLER_SUPER_ADMIN only. requireAuth additionally
//                   sets app.current_reseller_id = resellerId, which the
//                   RLS policies OR into their existing org check — rows
//                   from every client org under that reseller become
//                   visible on the 11 covered tables, on top of (not
//                   instead of) the normal single-org visibility.
export type TokenScope = "SINGLE_ORG" | "ALL_ORGS" | "RESELLER_ORGS";

export type AccessPayload = {
  sub: string;
  orgId?: string;
  scope?: TokenScope;
  resellerId?: string | null;
  role?: Role;
  reset?: boolean;
};

export type RefreshPayload = {
  sub: string;
  sessionId: string;
};

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "14d";

export function signAccessToken(payload: any, expiresIn: any = ACCESS_EXPIRES_IN): string {
  const options: jwt.SignOptions = { expiresIn };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET as string, options);
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET as string, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string): any {
  return jwt.verify(token, env.JWT_ACCESS_SECRET as string);
}

export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, env.JWT_REFRESH_SECRET as string);
}

export const refreshCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/api/v1", // Allow cookie to be sent to all API endpoints
  maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
});

export const accessCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/api/v1", // Allow cookie to be sent to all API endpoints
  maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
});
