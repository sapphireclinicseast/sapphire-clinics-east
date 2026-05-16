-- Add REHABILITATION_MEDICINE to the StaffDepartment enum.
-- Used at Sandbox East alongside Psychiatry + Developmental Pediatrician
-- as one of the three Medical Doctor sub-specialties in the patient portal.
ALTER TYPE "StaffDepartment" ADD VALUE IF NOT EXISTS 'REHABILITATION_MEDICINE';
