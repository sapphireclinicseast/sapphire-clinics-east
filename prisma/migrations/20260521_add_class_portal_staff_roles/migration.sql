-- ClassPortal: add FRONTDESK and BRANCH_ADMIN to the role enum so the
-- admin can create per-branch staff accounts directly in the portal.
ALTER TYPE "ClassPortalRole" ADD VALUE IF NOT EXISTS 'FRONTDESK';
ALTER TYPE "ClassPortalRole" ADD VALUE IF NOT EXISTS 'BRANCH_ADMIN';
