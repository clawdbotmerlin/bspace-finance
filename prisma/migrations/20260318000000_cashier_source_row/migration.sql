-- Add sourceRow to CashierEntry for traceability back to the cashier Excel sheet
ALTER TABLE "CashierEntry" ADD COLUMN "sourceRow" INTEGER;
