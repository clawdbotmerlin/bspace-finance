-- Make entityId optional on Outlet
-- An outlet can be associated with multiple entities, so we decouple the required FK

ALTER TABLE "Outlet" ALTER COLUMN "entityId" DROP NOT NULL;
