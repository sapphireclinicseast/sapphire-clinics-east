-- Med-rep view role: read-only, sees only Reports → Income Statement (monthly, gross revenue).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEDREP';
