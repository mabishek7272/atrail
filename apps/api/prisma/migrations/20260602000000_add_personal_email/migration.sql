-- Add personalEmail to UserProfile for notification delivery
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT;
