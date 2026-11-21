-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "seedsEarned" INTEGER;

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN "plantCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tendPlantId" TEXT;

-- AlterTable
ALTER TABLE "GrovePlant" ADD COLUMN "stage" INTEGER NOT NULL DEFAULT 1;
