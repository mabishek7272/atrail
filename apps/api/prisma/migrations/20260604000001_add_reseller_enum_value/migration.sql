-- Step 1: Add RESELLER_SUPER_ADMIN enum value (must commit before it can be used)
-- This runs in its own transaction so the value is committed before migration 2 uses it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RESELLER_SUPER_ADMIN';
