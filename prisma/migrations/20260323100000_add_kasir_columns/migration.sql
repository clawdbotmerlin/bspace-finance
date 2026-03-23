-- Add kasirNames to ReconciliationSession
ALTER TABLE "ReconciliationSession" ADD COLUMN IF NOT EXISTS "kasirNames" JSONB;

-- Add blockType and perKasirAmounts to CashierEntry
ALTER TABLE "CashierEntry" ADD COLUMN IF NOT EXISTS "blockType" TEXT NOT NULL DEFAULT 'REG';
ALTER TABLE "CashierEntry" ADD COLUMN IF NOT EXISTS "perKasirAmounts" JSONB;
