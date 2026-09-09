-- Step 2: Migrate existing SUPER_ADMIN → RESELLER_SUPER_ADMIN, TENANT → USER
UPDATE "User"           SET role               = 'RESELLER_SUPER_ADMIN' WHERE role               = 'SUPER_ADMIN';
UPDATE "User"           SET role               = 'USER'                 WHERE role               = 'TENANT';
UPDATE "OnboardingStep" SET "roleRequirement"  = 'RESELLER_SUPER_ADMIN' WHERE "roleRequirement"  = 'SUPER_ADMIN';
UPDATE "OnboardingStep" SET "roleRequirement"  = 'USER'                 WHERE "roleRequirement"  = 'TENANT';

-- Step 3: Replace Role enum to remove SUPER_ADMIN and TENANT
CREATE TYPE "Role_new" AS ENUM ('GOD', 'DEVELOPER', 'RESELLER_SUPER_ADMIN', 'ADMIN', 'ELITE', 'USER', 'INTERN');
ALTER TABLE "User"           ALTER COLUMN "role"             TYPE "Role_new" USING "role"::text::"Role_new";
ALTER TABLE "OnboardingStep" ALTER COLUMN "roleRequirement"  TYPE "Role_new" USING "roleRequirement"::text::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Step 4: Reseller table
CREATE TABLE "Reseller" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "ownerId"     TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reseller_ownerId_key"    ON "Reseller"("ownerId");
CREATE INDEX        "Reseller_createdById_idx" ON "Reseller"("createdById");
ALTER TABLE "Reseller"
    ADD CONSTRAINT "Reseller_ownerId_fkey"     FOREIGN KEY ("ownerId")     REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Reseller_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: resellerId on Organization
ALTER TABLE "Organization" ADD COLUMN "resellerId" TEXT;
CREATE INDEX "Organization_resellerId_idx" ON "Organization"("resellerId");
ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: OrgFeatureFlags table
CREATE TABLE "OrgFeatureFlags" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projects"       BOOLEAN NOT NULL DEFAULT true,
    "tasks"          BOOLEAN NOT NULL DEFAULT true,
    "kanban"         BOOLEAN NOT NULL DEFAULT true,
    "calendar"       BOOLEAN NOT NULL DEFAULT true,
    "chat"           BOOLEAN NOT NULL DEFAULT true,
    "notices"        BOOLEAN NOT NULL DEFAULT true,
    "attendance"     BOOLEAN NOT NULL DEFAULT true,
    "hr"             BOOLEAN NOT NULL DEFAULT true,
    "assets"         BOOLEAN NOT NULL DEFAULT true,
    "licenses"       BOOLEAN NOT NULL DEFAULT true,
    "finance"        BOOLEAN NOT NULL DEFAULT true,
    "renewals"       BOOLEAN NOT NULL DEFAULT true,
    "customers"      BOOLEAN NOT NULL DEFAULT true,
    "commissions"    BOOLEAN NOT NULL DEFAULT true,
    "analytics"      BOOLEAN NOT NULL DEFAULT true,
    "emergency"      BOOLEAN NOT NULL DEFAULT true,
    "documents"      BOOLEAN NOT NULL DEFAULT true,
    "integrations"   BOOLEAN NOT NULL DEFAULT true,
    "aiAssistant"    BOOLEAN NOT NULL DEFAULT true,
    "telegram"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgFeatureFlags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgFeatureFlags_organizationId_key" ON "OrgFeatureFlags"("organizationId");
ALTER TABLE "OrgFeatureFlags"
    ADD CONSTRAINT "OrgFeatureFlags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Backfill feature flags for all existing orgs (all modules enabled by default)
INSERT INTO "OrgFeatureFlags" ("id", "organizationId", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId") DO NOTHING;
