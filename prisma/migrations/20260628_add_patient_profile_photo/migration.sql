-- Patient-uploaded profile photo for the client portal, stored as a resized
-- base64 data URL. Nullable; only set for patients who upload one.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "profilePhoto" TEXT;
