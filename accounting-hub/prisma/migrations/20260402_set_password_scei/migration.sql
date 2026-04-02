-- Reset main admin password to: SCEI
-- Hash generated with bcryptjs cost 12
UPDATE "User"
SET "passwordHash" = '$2b$12$pvRG7Pt7vNui/r5QQGTn7uZfaqlqNBUloSe8NSKBhqXHOr423JRcO',
    "updatedAt"    = NOW()
WHERE email IN ('main@sapphireclinicseast.org', 'admin@sapphireclinicseast.org');
