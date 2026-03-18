-- FRO-31: Merge REG/EV sessions into a single session per outlet+date

-- 1. Reassign CashierEntry from EV sessions to their paired REG session
UPDATE "CashierEntry" ce
SET "sessionId" = reg.id
FROM "ReconciliationSession" ev
INNER JOIN "ReconciliationSession" reg
  ON reg."outletId" = ev."outletId"
  AND reg."sessionDate" = ev."sessionDate"
  AND reg."blockType" = 'REG'
WHERE ce."sessionId" = ev.id
  AND ev."blockType" = 'EV';

-- 2. Reassign BankMutation from EV sessions to their paired REG session
UPDATE "BankMutation" bm
SET "sessionId" = reg.id
FROM "ReconciliationSession" ev
INNER JOIN "ReconciliationSession" reg
  ON reg."outletId" = ev."outletId"
  AND reg."sessionDate" = ev."sessionDate"
  AND reg."blockType" = 'REG'
WHERE bm."sessionId" = ev.id
  AND ev."blockType" = 'EV';

-- 3. Reassign Discrepancy from EV sessions to their paired REG session
UPDATE "Discrepancy" d
SET "sessionId" = reg.id
FROM "ReconciliationSession" ev
INNER JOIN "ReconciliationSession" reg
  ON reg."outletId" = ev."outletId"
  AND reg."sessionDate" = ev."sessionDate"
  AND reg."blockType" = 'REG'
WHERE d."sessionId" = ev.id
  AND ev."blockType" = 'EV';

-- 4. Reassign AuditLog from EV sessions to their paired REG session
UPDATE "AuditLog" al
SET "sessionId" = reg.id
FROM "ReconciliationSession" ev
INNER JOIN "ReconciliationSession" reg
  ON reg."outletId" = ev."outletId"
  AND reg."sessionDate" = ev."sessionDate"
  AND reg."blockType" = 'REG'
WHERE al."sessionId" = ev.id
  AND ev."blockType" = 'EV';

-- 5. Delete EV sessions that had a paired REG (children already moved)
DELETE FROM "ReconciliationSession"
WHERE "blockType" = 'EV'
  AND EXISTS (
    SELECT 1 FROM "ReconciliationSession" reg
    WHERE reg."outletId" = "ReconciliationSession"."outletId"
      AND reg."sessionDate" = "ReconciliationSession"."sessionDate"
      AND reg."blockType" = 'REG'
  );

-- 6. Drop old unique constraint
ALTER TABLE "ReconciliationSession"
  DROP CONSTRAINT "ReconciliationSession_outletId_sessionDate_blockType_key";

-- 7. Remove blockType column
ALTER TABLE "ReconciliationSession" DROP COLUMN "blockType";

-- 8. Drop the BlockType enum
DROP TYPE "BlockType";

-- 9. Add new unique constraint (one session per outlet per date)
ALTER TABLE "ReconciliationSession"
  ADD CONSTRAINT "ReconciliationSession_outletId_sessionDate_key"
  UNIQUE ("outletId", "sessionDate");
