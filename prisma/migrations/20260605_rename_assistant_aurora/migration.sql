-- Rename the chat assistant in seeded copy: "Sappy" → "Aurora". The seed
-- migration (20260605_add_sappy_chat_faq) uses ON CONFLICT DO NOTHING, so on any
-- environment where the intro_message / system_prompt rows already exist the new
-- name must be applied with explicit UPDATEs. Idempotent: the WHERE LIKE guards
-- make re-running a no-op. Sorts after the seed (and the branch-label rebrand),
-- so it runs last. Only the user-facing name changes; internal identifiers
-- (env vars, route paths, cookie/header names) are intentionally left as-is.

UPDATE "ChatSetting" SET "value" = REPLACE("value", 'Sappy', 'Aurora') WHERE "value" LIKE '%Sappy%';
UPDATE "ChatFaq"     SET "answer" = REPLACE("answer", 'Sappy', 'Aurora') WHERE "answer" LIKE '%Sappy%';
