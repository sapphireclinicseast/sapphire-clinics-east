-- CreateTable
CREATE TABLE "FollowUpReminder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpReminder_patientId_department_key" ON "FollowUpReminder"("patientId", "department");
CREATE INDEX "FollowUpReminder_patientId_idx" ON "FollowUpReminder"("patientId");
CREATE INDEX "FollowUpReminder_sentAt_idx" ON "FollowUpReminder"("sentAt");

-- AddForeignKey
ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
