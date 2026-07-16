-- Seed the two new per-track school lists (SCHOOL_ARAL, SCHOOL_TINDIG) from the
-- existing legacy SCHOOL list, so both lists start populated with the current
-- schools and the admin can then curate each independently. No data is lost.
--
-- Fully idempotent: re-running skips any label already present in the target
-- list (WHERE NOT EXISTS on the unique (kind, label)). Deterministic ids
-- ('ara-'/'tin-' prefix on the source id) need no uuid/pgcrypto extension.
-- Runs after the ADD VALUE migration so the enum values already exist.

INSERT INTO "UgatOption" (id, kind, label, "sortOrder", "disabledAt", "createdAt", "updatedAt")
SELECT 'ara-' || o.id, 'SCHOOL_ARAL'::"UgatOptionKind", o.label, o."sortOrder", o."disabledAt", now(), now()
FROM "UgatOption" o
WHERE o.kind = 'SCHOOL'
  AND NOT EXISTS (
    SELECT 1 FROM "UgatOption" x WHERE x.kind = 'SCHOOL_ARAL' AND x.label = o.label
  );

INSERT INTO "UgatOption" (id, kind, label, "sortOrder", "disabledAt", "createdAt", "updatedAt")
SELECT 'tin-' || o.id, 'SCHOOL_TINDIG'::"UgatOptionKind", o.label, o."sortOrder", o."disabledAt", now(), now()
FROM "UgatOption" o
WHERE o.kind = 'SCHOOL'
  AND NOT EXISTS (
    SELECT 1 FROM "UgatOption" x WHERE x.kind = 'SCHOOL_TINDIG' AND x.label = o.label
  );
