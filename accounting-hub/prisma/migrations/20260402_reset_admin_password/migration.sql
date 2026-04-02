-- Force reset password for main admin to SCEIAccounting2026!
-- Hash: $2b$12$rMMbor3QloYWPTs0bobNouyNSoTibEWVzIbJuXUdOcPQgNpYU13RW
UPDATE "User"
SET "passwordHash" = '$2b$12$rMMbor3QloYWPTs0bobNouyNSoTibEWVzIbJuXUdOcPQgNpYU13RW',
    "updatedAt" = NOW()
WHERE email IN ('main@sapphireclinicseast.org', 'admin@sapphireclinicseast.org');
