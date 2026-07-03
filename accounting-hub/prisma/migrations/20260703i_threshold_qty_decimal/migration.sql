-- Allow half-session threshold counts (0.5 increments)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'Service' AND column_name = 'thresholdQty') = 'integer' THEN
    ALTER TABLE "Service" ALTER COLUMN "thresholdQty" TYPE DECIMAL(65,30);
  END IF;
END $$;
