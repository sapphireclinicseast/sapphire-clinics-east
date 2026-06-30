-- Track which expense EWT has been remitted to BIR via a Taxes EWT RFP.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "ewtRemitted" BOOLEAN NOT NULL DEFAULT false;
