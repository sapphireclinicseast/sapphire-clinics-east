-- Seed admin users for accounting hub (idempotent)
INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  'accounting-admin-01',
  'System Admin',
  'admin@sapphireclinicseast.org',
  '$2b$12$rMMbor3QloYWPTs0bobNouyNSoTibEWVzIbJuXUdOcPQgNpYU13RW',
  'ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  'accounting-main-01',
  'Hannah Pellejo',
  'main@sapphireclinicseast.org',
  '$2b$12$rMMbor3QloYWPTs0bobNouyNSoTibEWVzIbJuXUdOcPQgNpYU13RW',
  'ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
