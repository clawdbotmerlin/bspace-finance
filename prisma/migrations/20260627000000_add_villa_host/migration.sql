-- CreateTable: VillaHost
CREATE TABLE "VillaHost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VillaHost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique name
CREATE UNIQUE INDEX "VillaHost_name_key" ON "VillaHost"("name");

-- Seed default host (all existing data belongs to Anjuna Villas)
INSERT INTO "VillaHost" ("id", "name", "isActive", "createdAt")
VALUES ('cmc_anjuna0000000000000001', 'Anjuna Villas', true, NOW());

-- AddColumn hostId to VillaUpload (nullable first to allow data migration)
ALTER TABLE "VillaUpload" ADD COLUMN "hostId" TEXT;

-- Assign all existing uploads to Anjuna Villas
UPDATE "VillaUpload" SET "hostId" = 'cmc_anjuna0000000000000001';

-- Make hostId NOT NULL
ALTER TABLE "VillaUpload" ALTER COLUMN "hostId" SET NOT NULL;

-- AddForeignKey on VillaUpload
ALTER TABLE "VillaUpload" ADD CONSTRAINT "VillaUpload_hostId_fkey"
FOREIGN KEY ("hostId") REFERENCES "VillaHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumn hostId to VillaBooking (nullable first)
ALTER TABLE "VillaBooking" ADD COLUMN "hostId" TEXT;

-- Assign all existing bookings to Anjuna Villas
UPDATE "VillaBooking" SET "hostId" = 'cmc_anjuna0000000000000001';

-- Make hostId NOT NULL
ALTER TABLE "VillaBooking" ALTER COLUMN "hostId" SET NOT NULL;

-- AddForeignKey on VillaBooking
ALTER TABLE "VillaBooking" ADD CONSTRAINT "VillaBooking_hostId_fkey"
FOREIGN KEY ("hostId") REFERENCES "VillaHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old unique constraint (listingId, checkIn)
DROP INDEX "VillaBooking_listingId_checkIn_key";

-- Create new unique constraint including hostId
CREATE UNIQUE INDEX "VillaBooking_hostId_listingId_checkIn_key"
ON "VillaBooking"("hostId", "listingId", "checkIn");
