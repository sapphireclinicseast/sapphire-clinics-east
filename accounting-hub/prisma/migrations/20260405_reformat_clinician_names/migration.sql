-- Reformat clinicianName from "LASTNAME, FIRSTNAME" to "FIRSTNAME LASTNAME"
-- for all existing orders that have the old comma-separated format.
UPDATE "Order"
SET "clinicianName" = TRIM(SPLIT_PART("clinicianName", ',', 2)) || ' ' || TRIM(SPLIT_PART("clinicianName", ',', 1))
WHERE "clinicianName" IS NOT NULL
  AND "clinicianName" LIKE '%,%';

-- Also reformat consultant names that are in the old format
UPDATE "Consultant"
SET "name" = TRIM(SPLIT_PART("name", ',', 2)) || ' ' || TRIM(SPLIT_PART("name", ',', 1))
WHERE "name" LIKE '%,%';
