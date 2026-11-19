-- CreateTable
CREATE TABLE "GrovePlant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ALIVE',
    "plantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "witheredAt" TIMESTAMP(3),
    "sessionId" TEXT,

    CONSTRAINT "GrovePlant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrovePlant_sessionId_key" ON "GrovePlant"("sessionId");

-- CreateIndex
CREATE INDEX "GrovePlant_userId_idx" ON "GrovePlant"("userId");

-- Prisma's role bypasses RLS; this keeps the table closed to Supabase's Data API.
ALTER TABLE "GrovePlant" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN "plantSpecies" TEXT,
ADD COLUMN "plantX" INTEGER,
ADD COLUMN "plantY" INTEGER;
