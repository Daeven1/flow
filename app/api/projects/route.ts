import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay } from "date-fns";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId },
    include: { tasks: { orderBy: { deadline: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, deadline, templateKey } = body;

  const project = await prisma.project.create({
    data: {
      userId,
      name,
      deadline: deadline ? new Date(deadline) : null,
      templateKey: templateKey || null,
    },
  });

  if (templateKey && deadline) {
    const template = await prisma.template.findUnique({
      where: { userId_key: { userId, key: templateKey } },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });

    if (template) {
      const workNightDays = await getWorkNightDays(userId);
      const deadlineDate = startOfDay(new Date(deadline));

      await prisma.task.createMany({
        data: template.tasks.map((t) => {
          const taskDeadline = addDays(deadlineDate, -t.leadDays);
          const scheduledDate = computeScheduledDate(
            taskDeadline,
            t.workCategory,
            t.estMinutes,
            workNightDays
          );
          return {
            userId,
            projectId: project.id,
            name: t.name,
            leadDays: t.leadDays,
            deadline: taskDeadline,
            scheduledDate,
            workCategory: t.workCategory,
            sprint: t.sprint,
            estMinutes: t.estMinutes,
          };
        }),
      });
    }
  }

  const full = await prisma.project.findUnique({
    where: { id: project.id },
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  return NextResponse.json(full, { status: 201 });
}
