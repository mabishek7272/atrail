-- Phase 0: org-scoping foundation fixes
--
-- 1. User.resellerId — lets requireAuth identify a RESELLER_SUPER_ADMIN's
--    reseller without a lookup per request (see middlewares/auth.ts).
-- 2. current_reseller_id() + updated tenant_isolation policies — extends
--    the existing GOD/DEVELOPER "all orgs" RLS bypass (current_org_id() IS
--    NULL) with an equivalent "all orgs under my reseller" bypass for
--    RESELLER_SUPER_ADMIN, enforced at the DB layer rather than relying on
--    individual controllers to remember to filter by resellerId (which was
--    the actual root cause of Bug 3 in the Phase 0 investigation — some
--    controllers filtered correctly, others didn't, and RLS itself had no
--    way to represent "all orgs under this reseller" at all).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resellerId" TEXT;

-- Backfill: a RESELLER_SUPER_ADMIN's resellerId is either the reseller they
-- own, or (if they were created as staff under a reseller's own org) their
-- home organization's resellerId.
UPDATE "User" u
SET "resellerId" = r.id
FROM "Reseller" r
WHERE r."ownerId" = u.id AND u."resellerId" IS NULL;

UPDATE "User" u
SET "resellerId" = o."resellerId"
FROM "Organization" o
WHERE o.id = u."organizationId"
  AND o."resellerId" IS NOT NULL
  AND u."resellerId" IS NULL
  AND u.role = 'RESELLER_SUPER_ADMIN';

-- current_reseller_id() mirrors current_org_id(): empty session var reads
-- back as NULL, meaning "no reseller-wide scope requested".
CREATE OR REPLACE FUNCTION current_reseller_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_reseller_id', TRUE), '');
$$ LANGUAGE sql STABLE;

-- Recreate each tenant_isolation policy with a third disjunct: visible if
-- the row's org belongs to the reseller currently in session scope.
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "User"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );

DROP POLICY IF EXISTS tenant_isolation ON "Project";
CREATE POLICY tenant_isolation ON "Project"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "Project"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );

DROP POLICY IF EXISTS tenant_isolation ON "Task";
CREATE POLICY tenant_isolation ON "Task"
  USING (EXISTS (
    SELECT 1 FROM "Project" p
    WHERE p.id = "Task"."projectId" AND (
      p."organizationId" = current_org_id() OR current_org_id() IS NULL
      OR (current_reseller_id() IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Organization" o
        WHERE o.id = p."organizationId" AND o."resellerId" = current_reseller_id()
      ))
    )
  ));

DROP POLICY IF EXISTS tenant_isolation ON "Notice";
CREATE POLICY tenant_isolation ON "Notice"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "Notice"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );

DROP POLICY IF EXISTS tenant_isolation ON "CalendarEvent";
CREATE POLICY tenant_isolation ON "CalendarEvent"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "CalendarEvent"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );

DROP POLICY IF EXISTS tenant_isolation ON "Document";
CREATE POLICY tenant_isolation ON "Document"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "Document"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );

DROP POLICY IF EXISTS tenant_isolation ON "ConnectedAccount";
CREATE POLICY tenant_isolation ON "ConnectedAccount"
  USING (EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "ConnectedAccount"."userId" AND (
      u."organizationId" = current_org_id() OR current_org_id() IS NULL
      OR (current_reseller_id() IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Organization" o
        WHERE o.id = u."organizationId" AND o."resellerId" = current_reseller_id()
      ))
    )
  ));

DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("actorId" IS NULL OR EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "AuditLog"."actorId" AND (
      u."organizationId" = current_org_id() OR current_org_id() IS NULL
      OR (current_reseller_id() IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Organization" o
        WHERE o.id = u."organizationId" AND o."resellerId" = current_reseller_id()
      ))
    )
  ));

DROP POLICY IF EXISTS tenant_isolation ON "LeaveRequest";
CREATE POLICY tenant_isolation ON "LeaveRequest"
  USING (EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "LeaveRequest"."userId" AND (
      u."organizationId" = current_org_id() OR current_org_id() IS NULL
      OR (current_reseller_id() IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Organization" o
        WHERE o.id = u."organizationId" AND o."resellerId" = current_reseller_id()
      ))
    )
  ));

DROP POLICY IF EXISTS tenant_isolation ON "Attendance";
CREATE POLICY tenant_isolation ON "Attendance"
  USING (EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "Attendance"."userId" AND (
      u."organizationId" = current_org_id() OR current_org_id() IS NULL
      OR (current_reseller_id() IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Organization" o
        WHERE o.id = u."organizationId" AND o."resellerId" = current_reseller_id()
      ))
    )
  ));

DROP POLICY IF EXISTS tenant_isolation ON "Asset";
CREATE POLICY tenant_isolation ON "Asset"
  USING (
    "organizationId" = current_org_id() OR current_org_id() IS NULL
    OR (current_reseller_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Organization" o
      WHERE o.id = "Asset"."organizationId" AND o."resellerId" = current_reseller_id()
    ))
  );
