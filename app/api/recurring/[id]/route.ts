export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.recurringTask.findUnique({ where: { id } });
  if (!template || template.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name, sprint, estMinutes, workCategory, context,
    recurrenceType, recurrenceDays, recurrenceMonthDay, deadlineOffset, active,
  } = body;

  const updated = await prisma.recurringTask.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(sprint !== undefined && { sprint: Number(sprint) }),
      ...(estMinutes !== undefined && { estMinutes: Number(estMinutes) }),
      ...(workCategory !== undefined && { workCategory }),
      ...(context !== undefined && { context }),
      ...(recurrenceType !== undefined && { recurrenceType }),
      ...(recurrenceDays !== undefined && { recurrenceDays }),
      ...(recurrenceMonthDay !== undefined && {
        recurrenceMonthDay: recurrenceMonthDay ? Number(recurrenceMonthDay) : null,
      }),
      ...(deadlineOffset !== undefined && { deadlineOffset: Number(deadlineOffset) }),
      ...(active !== undefined && { active }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.recurringTask.findUnique({ where: { id } });
  if (!template || template.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // onDelete: SetNull in schema automatically nullifies recurringTaskId on spawned tasks
  await prisma.recurringTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
