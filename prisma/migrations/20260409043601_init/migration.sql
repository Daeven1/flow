-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "deadline" DATETIME,
    "templateKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "sprint" INTEGER NOT NULL,
    "estMinutes" INTEGER NOT NULL DEFAULT 30,
    "actualMinutes" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "highlight" TEXT NOT NULL DEFAULT '',
    "highlightDone" BOOLEAN NOT NULL DEFAULT false,
    "microCommitment" TEXT NOT NULL DEFAULT '',
    "microDone" BOOLEAN NOT NULL DEFAULT false,
    "brainDump" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WeeklyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "highlightsDone" INTEGER NOT NULL DEFAULT 0,
    "microsDone" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "sprint" INTEGER NOT NULL,
    "estMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_date_key" ON "DailyLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyLog_weekStart_key" ON "WeeklyLog"("weekStart");
