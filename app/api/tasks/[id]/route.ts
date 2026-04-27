export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";
import { validateApiKey } from "@/lib/remindersAuth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // fallback to API key auth for iOS Shortcuts reminderId write-back
  const userId = (await getUser()) ?? validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("pinned" in body) data.pinned = Boolean(body.pinned);
  if ("done" in body) {
    data.done = body.done;
    data.doneAt = body.done ? new Date() : null;
  }
  if ("name" in body) data.name = body.name;
  if ("sprint" in body) data.sprint = Number(body.sprint);
  if ("estMinutes" in body) data.estMinutes = Number(body.estMinutes);
  if ("actualMinutes" in body)
    data.actualMinutes = body.actualMinutes ? Number(body.actualMinutes) : null;
  if ("workCategory" in body) data.workCategory = body.workCategory;
  if ("leadDays" in body) data.leadDays = Number(body.leadDays);
  if ("reminderId" in body) data.reminderId = body.reminderId ?? null;

  if ("deadline" in body) {
    data.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.deadline && !("scheduledDate" in body)) {
      const existing = await prisma.task.findUnique({
        where: { id, userId },
      });
      const workNightDays = await getWorkNightDays(userId);
      data.scheduledDate = computeScheduledDate(
        new Date(body.deadline),
        (body.workCategory ?? existing?.workCategory ?? "STANDARD") as string,
        Number(body.estMinutes ?? existing?.estMinutes ?? 30),
        workNightDays
      );
    } else if (!body.deadline) {
      data.scheduledDate = null;
    }
  }

  if ("scheduledDate" in body) {
    data.scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : null;
  }

  const task = await prisma.task.update({
    where: { id, userId },
    data,
    include: { project: true },
  });

  return NextResponse.json(task);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.task.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
