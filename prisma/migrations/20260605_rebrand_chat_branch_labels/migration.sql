-- Rebrand the Sappy chatbot's seeded copy: "Sandbox East/Greenhills/GH" → the
-- new branch names. The seed migration (20260605_add_sappy_chat_faq) uses
-- ON CONFLICT DO NOTHING, so on any environment where those rows already exist
-- the new wording must be applied with explicit UPDATEs. Idempotent: the WHERE
-- LIKE guards make re-running a no-op. Runs after the seed (later folder name).

-- ── ChatFaq answers ─────────────────────────────────────────────────────────
UPDATE "ChatFaq" SET "answer" = REPLACE("answer", 'Sandbox Greenhills', 'Greenhills Branch') WHERE "answer" LIKE '%Sandbox Greenhills%';
UPDATE "ChatFaq" SET "answer" = REPLACE("answer", 'Sandbox East', 'East Branch')             WHERE "answer" LIKE '%Sandbox East%';
UPDATE "ChatFaq" SET "answer" = REPLACE("answer", 'Sandbox GH', 'Greenhills Branch')         WHERE "answer" LIKE '%Sandbox GH%';

-- ── ChatSetting values (intro/fallback/system_prompt) ───────────────────────
UPDATE "ChatSetting" SET "value" = REPLACE("value", 'Sandbox Greenhills', 'Greenhills Branch') WHERE "value" LIKE '%Sandbox Greenhills%';
UPDATE "ChatSetting" SET "value" = REPLACE("value", 'Sandbox East', 'East Branch')             WHERE "value" LIKE '%Sandbox East%';
UPDATE "ChatSetting" SET "value" = REPLACE("value", 'Sandbox GH', 'Greenhills Branch')         WHERE "value" LIKE '%Sandbox GH%';
