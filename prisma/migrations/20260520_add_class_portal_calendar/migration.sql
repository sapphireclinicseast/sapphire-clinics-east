-- ClassPortal: calendar (events + PDF upload) for class.sapphireclinicseast.org.

CREATE TYPE "ClassPortalEventType" AS ENUM (
  'CLASS_CANCELLED', 'HOLIDAY', 'FIELD_TRIP', 'IEP_REVIEW', 'EVENT'
);

CREATE TABLE "ClassPortalCalendarEvent" (
  "id"          TEXT PRIMARY KEY,
  "date"        DATE NOT NULL,
  "endDate"     DATE,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "type"        "ClassPortalEventType" NOT NULL DEFAULT 'EVENT',
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ClassPortalCalendarEvent_date_idx" ON "ClassPortalCalendarEvent"("date");

CREATE TABLE "ClassPortalCalendarPdf" (
  "id"         TEXT PRIMARY KEY,
  "fileName"   TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL DEFAULT 'application/pdf',
  "data"       BYTEA NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
