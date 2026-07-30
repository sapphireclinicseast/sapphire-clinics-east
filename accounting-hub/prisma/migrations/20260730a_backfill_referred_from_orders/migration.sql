-- Backfill: every non-voided POS order that names a referrer becomes a
-- ReferredPatient link (one per referrer + patient), so the Referral section's
-- Referred Patients tab and Dashboard reflect what the front desk already
-- entered at cashiering. Going forward the API auto-links on order create/edit;
-- this catches the history. Idempotent — replayed each deploy.
INSERT INTO "ReferredPatient" ("id", "referrerId", "patientId", "patientName", "note", "createdById", "createdAt")
SELECT
  'rpbf_' || md5(o."referrerId" || ':' || lower(btrim(o."patientName"))),
  o."referrerId",
  (array_remove(array_agg(o."patientId" ORDER BY o."createdAt"), NULL))[1],
  min(btrim(o."patientName")),
  'Auto-linked from POS order',
  NULL,
  min(o."createdAt")
FROM "Order" o
JOIN "Referrer" r ON r."id" = o."referrerId"
WHERE o."patientName" IS NOT NULL
  AND btrim(o."patientName") <> ''
  AND o."status"::text <> 'VOIDED'
  AND NOT EXISTS (
    SELECT 1 FROM "ReferredPatient" rp
    WHERE rp."referrerId" = o."referrerId"
      AND (
        (o."patientId" IS NOT NULL AND rp."patientId" = o."patientId")
        OR lower(btrim(rp."patientName")) = lower(btrim(o."patientName"))
      )
  )
GROUP BY o."referrerId", lower(btrim(o."patientName"))
ON CONFLICT ("id") DO NOTHING;
