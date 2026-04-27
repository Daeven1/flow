-- AlterTable
ALTER TABLE "Task" ADD COLUMN "reminderId" TEXT,
ADD COLUMN "syncedFrom" TEXT NOT NULL DEFAULT 'app';
