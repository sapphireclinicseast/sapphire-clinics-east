-- One-time data tag: mark existing PT/OT/SLP HMO & GL services as HMO/GL so their
-- sales post as Receivables Sales. HMO = name starts with a known HMO provider;
-- GL = name contains "- OP" (outpatient guarantee-letter services).
UPDATE "Service" SET "isHmoGl" = true
WHERE "department" IN ('PT', 'OT', 'SLP')
  AND (
    "name" ILIKE 'AMAPHIL%' OR
    "name" ILIKE 'AVEGA%' OR
    "name" ILIKE 'ASIANCARE%' OR
    "name" ILIKE 'HPPI%' OR
    "name" ILIKE 'INLIFE%' OR
    "name" ILIKE 'INSULAR%' OR
    "name" ILIKE 'INTELLICARE%' OR
    "name" ILIKE 'LACSON & LACSON%' OR
    "name" ILIKE 'LIFE AND HEALTH HMP%' OR
    "name" ILIKE 'MEDASIA%' OR
    "name" ILIKE 'MEDOCARE%' OR
    "name" ILIKE 'PACIFIC CROSS%' OR
    "name" ILIKE 'PHILBRITISH%' OR
    "name" ILIKE 'PHILCARE%' OR
    "name" ILIKE 'SUNLIFE%' OR
    "name" ILIKE 'VALUCARE%' OR
    "name" ILIKE '%- OP%'
  );
