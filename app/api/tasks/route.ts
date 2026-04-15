export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function DELETE() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.task.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { projectId, name, leadDays, deadline, workCategory, sprint, estMinutes } = body;

  let scheduledDate: Date | null = null;
  if (deadline) {
    const workNightDays = await getWorkNightDays(userId);
    scheduledDate = computeScheduledDate(
      new Date(deadline),
      workCategory ?? "STANDARD",
      Number(estMinutes) || 30,
      workNightDays
    );
  }

  const task = await prisma.task.create({
    data: {
      userId,
      projectId: projectId || null,
      name,
      leadDays: leadDays ?? 0,
      deadline: deadline ? new Date(deadline) : null,
      scheduledDate,
      workCategory: workCategory ?? "STANDARD",
      sprint: Number(sprint),
      estMinutes: Number(estMinutes) || 30,
    },
    include: { project: true },
  });

  return NextResponse.json(task, { status: 201 });
}
