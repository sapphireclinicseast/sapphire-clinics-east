-- ServiceVoucherBatch.departments — scope a POS voucher batch to departments (empty = all)
-- Apply by hand on the server (deploy does NOT run DDL):
--   docker exec -i accounting_db psql -U sapphire -d sapphire_accounting < migrate-service-voucher-departments.sql

DO $$ BEGIN ALTER TABLE "ServiceVoucherBatch" ADD COLUMN "departments" TEXT[] NOT NULL DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
