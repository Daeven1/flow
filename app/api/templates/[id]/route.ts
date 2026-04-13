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
  const body = await req.json();
  const { label, description, tasks } = body;

  const data: Record<string, unknown> = {};
  if ("label" in body) data.label = label;
  if ("description" in body) data.description = description;

  if (Array.isArray(tasks)) {
    await prisma.templateTask.deleteMany({ where: { templateId: id } });
    await prisma.templateTask.createMany({
      data: tasks.map(
        (task: { name: string; leadDays: number; sprint: number; estMinutes: number; workCategory: string }, j: number) => ({
          templateId: id,
          name: task.name,
          leadDays: task.leadDays ?? 0,
          sprint: task.sprint ?? 4,
          estMinutes: task.estMinutes ?? 30,
          workCategory: task.workCategory ?? "STANDARD",
          sortOrder: j,
        })
      ),
    });
  }

  const updated = await prisma.template.update({
    where: { id, userId },
    data,
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
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
  await prisma.template.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
