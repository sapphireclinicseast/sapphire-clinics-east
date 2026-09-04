-- Scheduled doctor/clinic fee split: takes effect together with newPrice on its
-- effective date; the current doctorFee/clinicFee stay until then.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "newDoctorFee" DECIMAL(65,30);
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "newClinicFee" DECIMAL(65,30);
