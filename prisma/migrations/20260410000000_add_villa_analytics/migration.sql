-- CreateTable
CREATE TABLE "VillaUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    CONSTRAINT "VillaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VillaBooking" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "accommodationFare" DECIMAL(18,2) NOT NULL,
    "totalPayout" DECIMAL(18,2) NOT NULL,
    "listing" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "numberOfNights" INTEGER NOT NULL,
    "numberOfGuests" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VillaBooking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VillaUpload" ADD CONSTRAINT "VillaUpload_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VillaBooking" ADD CONSTRAINT "VillaBooking_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "VillaUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "VillaBooking_listingId_checkIn_key" ON "VillaBooking"("listingId", "checkIn");
