export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { startOfDay, endOfDay, addDays } from "date-fns";

export async function POST() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const dayOfWeek = today.getDay();    // 0=Sun, 1=Mon, …, 6=Sat
  const dayOfMonth = today.getDate();  // 1–31
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const templates = await prisma.recurringTask.findMany({
    where: { userId, active: true },
  });

  let spawned = 0;

  for (const template of templates) {
    let isRecurrenceDay = false;

    if (template.recurrenceType === "DAILY") {
      isRecurrenceDay = true;
    } else if (template.recurrenceType === "WEEKLY") {
      const days: number[] = JSON.parse(template.recurrenceDays || "[]");
      isRecurrenceDay = days.includes(dayOfWeek);
    } else if (template.recurrenceType === "MONTHLY") {
      const targetDay = template.recurrenceMonthDay ?? 1;
      const effectiveDay = Math.min(targetDay, lastDayOfMonth);
      isRecurrenceDay = dayOfMonth === effectiveDay;
    }

    if (!isRecurrenceDay) continue;

    // Idempotency check — skip if an instance already exists for today
    const existing = await prisma.task.findFirst({
      where: {
        recurringTaskId: template.id,
        scheduledDate: { gte: today, lte: todayEnd },
      },
    });
    if (existing) continue;

    await prisma.task.create({
      data: {
        userId,
        name: template.name,
        sprint: template.sprint,
        estMinutes: template.estMinutes,
        workCategory: template.workCategory,
        context: template.context,
        scheduledDate: today,
        deadline: addDays(today, template.deadlineOffset),
        recurringTaskId: template.id,
      },
    });

    spawned++;
  }

  return NextResponse.json({ spawned });
}
