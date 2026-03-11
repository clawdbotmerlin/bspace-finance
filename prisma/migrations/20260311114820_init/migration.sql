-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'finance', 'manager');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('uploading', 'reviewing', 'pending_signoff', 'signed_off');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('REG', 'EV');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('QR', 'DEBIT', 'KK', 'CASH', 'VOUCHER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('matched', 'unmatched', 'zero', 'prior_period', 'manual');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('missing_in_bank', 'unexpected_bank_entry', 'amount_mismatch', 'prior_period_settlement', 'duplicate', 'other');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('open', 'investigating', 'resolved');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'finance',
    "outletId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdcTerminal" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "terminalCode" TEXT NOT NULL,
    "bankLabel" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "accountNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdcTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankColumnConfig" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "skipRowsTop" INTEGER NOT NULL DEFAULT 0,
    "skipRowsBottom" INTEGER NOT NULL DEFAULT 0,
    "dateCol" TEXT,
    "dateFormat" TEXT,
    "amountCol" TEXT,
    "directionCol" TEXT,
    "directionCreditValue" TEXT,
    "grossAmountRegex" TEXT,
    "columnMapping" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankColumnConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationSession" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "blockType" "BlockType" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'uploading',
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "signedOffBy" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "signOffComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashierEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "terminalCode" TEXT,
    "bankName" TEXT NOT NULL,
    "terminalId" TEXT,
    "paymentType" "PaymentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "notaBill" TEXT,
    "entityNameRaw" TEXT,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'unmatched',
    "matchedMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMutation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "transactionDate" DATE NOT NULL,
    "description" TEXT,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2),
    "mdrAmount" DECIMAL(18,2),
    "direction" TEXT NOT NULL,
    "referenceNo" TEXT,
    "outletRef" TEXT,
    "rawData" JSONB,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'unmatched',
    "matchedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cashierEntryId" TEXT,
    "bankMutationId" TEXT,
    "discrepancyType" "DiscrepancyType" NOT NULL,
    "amountDiff" DECIMAL(18,2),
    "notes" TEXT,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadSummary" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_code_key" ON "Outlet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EdcTerminal_terminalId_key" ON "EdcTerminal"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "BankColumnConfig_bankName_key" ON "BankColumnConfig"("bankName");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationSession_outletId_sessionDate_blockType_key" ON "ReconciliationSession"("outletId", "sessionDate", "blockType");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdcTerminal" ADD CONSTRAINT "EdcTerminal_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationSession" ADD CONSTRAINT "ReconciliationSession_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationSession" ADD CONSTRAINT "ReconciliationSession_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationSession" ADD CONSTRAINT "ReconciliationSession_signedOffBy_fkey" FOREIGN KEY ("signedOffBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierEntry" ADD CONSTRAINT "CashierEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMutation" ADD CONSTRAINT "BankMutation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_cashierEntryId_fkey" FOREIGN KEY ("cashierEntryId") REFERENCES "CashierEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_bankMutationId_fkey" FOREIGN KEY ("bankMutationId") REFERENCES "BankMutation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
