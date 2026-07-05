-- Bank/COA account the asset was purchased from (credited on the acquisition JE)
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "sourceAccountId" TEXT;
