-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_reminderId_key" ON "Task"("userId", "reminderId");
