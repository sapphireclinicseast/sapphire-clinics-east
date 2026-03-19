-- Add ADMINISTRATION value to StaffDepartment enum
ALTER TYPE "StaffDepartment" ADD VALUE IF NOT EXISTS 'ADMINISTRATION';
