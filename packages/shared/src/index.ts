import { z } from "zod";

export const RoleEnum = z.enum([
  "GOD", "DEVELOPER", "RESELLER_SUPER_ADMIN", "ADMIN", "ELITE", "USER", "INTERN"
]);
export type Role = z.infer<typeof RoleEnum>;

const ROLE_W: Record<string, number> = {
  GOD: 200, DEVELOPER: 190, RESELLER_SUPER_ADMIN: 150,
  ADMIN: 100, ELITE: 80, USER: 70, INTERN: 30,
};

// Messaging rule helper
// ADMIN+ can message anyone in their org
// ELITE can message USER/INTERN (ELITE→ADMIN requires explicit ChatPermission, checked separately)
// USER/INTERN can message ADMIN+ and ELITE
export function canMessage(from: Role, to: Role): boolean {
  const fw = ROLE_W[from] ?? 0;
  const tw = ROLE_W[to]   ?? 0;
  if (fw >= ROLE_W["ADMIN"]) return true;            // ADMIN and above → anyone
  if (from === "ELITE") return tw <= ROLE_W["ELITE"]; // ELITE → USER/INTERN (ADMIN needs permission)
  if (from === "USER" || from === "INTERN") return tw >= ROLE_W["ELITE"]; // USER/INTERN → ELITE+
  return false;
}

export function canEliteMessageAdmin(hasPermission: boolean): boolean {
  return hasPermission;
}

export const EnvSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  ENCRYPTION_KEY: z.string().min(32),
  REDIS_URL: z.string().default("redis://localhost:6379"),
});

export * from "./assets.js";
