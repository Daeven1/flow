export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEMPLATES } from "@/lib/templates";
import { getUser } from "@/lib/auth";

async function seedTemplatesIfEmpty(userId: string) {
  const count = await prisma.template.count({ where: { userId } });
  if (count > 0) return;

  for (let i = 0; i < TEMPLATES.length; i++) {
    const t = TEMPLATES[i];
    await prisma.template.create({
      data: {
        userId,
        key: t.key,
        label: t.label,
        description: t.description,
        isCustom: false,
        sortOrder: i,
        tasks: {
          create: t.tasks.map((task, j) => ({
            name: task.name,
            leadDays: task.leadDays,
            sprint: task.sprint,
            estMinutes: task.estMinutes,
            workCategory: task.workCategory,
            sortOrder: j,
          })),
        },
      },
    });
  }
}

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await seedTemplatesIfEmpty(userId);
  const templates = await prisma.template.findMany({
    where: { userId },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { label, description, tasks } = body;

  const count = await prisma.template.count({ where: { userId } });
  const key = `custom-${Date.now()}`;

  const template = await prisma.template.create({
    data: {
      userId,
      key,
      label,
      description: description ?? "",
      isCustom: true,
      sortOrder: count,
      tasks: {
        create: (tasks ?? []).map(
          (task: { name: string; leadDays: number; sprint: number; estMinutes: number; workCategory: string }, j: number) => ({
            name: task.name,
            leadDays: task.leadDays ?? 0,
            sprint: task.sprint ?? 4,
            estMinutes: task.estMinutes ?? 30,
            workCategory: task.workCategory ?? "STANDARD",
            sortOrder: j,
          })
        ),
      },
    },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(template, { status: 201 });
}
