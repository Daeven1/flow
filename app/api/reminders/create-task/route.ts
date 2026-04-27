export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";
import { computeScheduledDate } from "@/lib/utils";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function POST(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, due_date, reminder_id } = body;

  if (!title || !reminder_id) {
    return NextResponse.json({ error: "Missing required fields: title, reminder_id" }, { status: 400 });
  }

  // Idempotency: if a task with this reminderId already exists, return it
  const existing = await prisma.task.findUnique({
    where: { userId_reminderId: { userId, reminderId: reminder_id } },
  });
  if (existing) {
    return NextResponse.json({ success: true, task_id: existing.id });
  }

  const deadline = due_date ? new Date(due_date) : null;
  let scheduledDate: Date | null = null;
  if (deadline) {
    const workNightDays = await getWorkNightDays(userId);
    scheduledDate = computeScheduledDate(deadline, "STANDARD", 30, workNightDays);
  }

  const task = await prisma.task.create({
    data: {
      userId,
      name: title,
      deadline,
      scheduledDate,
      sprint: 1,
      syncedFrom: "reminders",
      reminderId: reminder_id,
      workCategory: "STANDARD",
      estMinutes: 30,
      leadDays: 0,
    },
  });

  return NextResponse.json({ success: true, task_id: task.id }, { status: 201 });
}
