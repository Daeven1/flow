export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskId, taskName, sprint, estMinutes, actualMinutes } = body;

  const log = await prisma.timeLog.create({
    data: {
      taskId,
      taskName,
      sprint: Number(sprint),
      estMinutes: Number(estMinutes),
      actualMinutes: Number(actualMinutes),
    },
  });

  await prisma.task.update({
    where: { id: taskId, userId },
    data: { actualMinutes: Number(actualMinutes) },
  });

  return NextResponse.json(log, { status: 201 });
}
