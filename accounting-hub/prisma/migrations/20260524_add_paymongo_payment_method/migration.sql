-- Add PAYMONGO as a valid PaymentMethod enum value
-- PayMongo is an online payment gateway used in the cashier
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYMONGO';
