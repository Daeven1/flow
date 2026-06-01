export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { TEACHER_DEFAULT_PRESETS, STUDENT_DEFAULT_PRESETS } from "@/lib/presetDefaults";
import { TEMPLATES, STUDENT_TEMPLATES } from "@/lib/templates";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]", userMode: "TEACHER" },
    update: {},
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
    userMode: settings.userMode as "TEACHER" | "STUDENT",
  });
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workNightDays, userMode } = body;

  if (userMode !== undefined) {
    const validModes = ["TEACHER", "STUDENT"];
    if (!validModes.includes(userMode)) {
      return NextResponse.json({ error: "Invalid userMode" }, { status: 400 });
    }

    const current = await prisma.userSettings.findUnique({ where: { id: userId } });
    const modeChanged = userMode !== (current?.userMode ?? "TEACHER");

    if (modeChanged) {
      const presets = userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;
      const templates = userMode === "STUDENT" ? STUDENT_TEMPLATES : TEMPLATES;

      const updatedSettings = await prisma.$transaction(async (tx) => {
        await tx.taskPreset.deleteMany({ where: { userId } });
        await tx.taskPreset.createMany({
          data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
        });
        await tx.template.deleteMany({ where: { userId, isCustom: false } });
        for (let i = 0; i < templates.length; i++) {
          const t = templates[i];
          await tx.template.create({
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
        return tx.userSettings.upsert({
          where: { id: userId },
          create: { id: userId, workNightDays: JSON.stringify(workNightDays ?? [1]), userMode },
          update: { userMode, ...(workNightDays !== undefined && { workNightDays: JSON.stringify(workNightDays) }) },
        });
      });

      return NextResponse.json({
        workNightDays: JSON.parse(updatedSettings.workNightDays) as number[],
        userMode: updatedSettings.userMode as "TEACHER" | "STUDENT",
      });
    }
  }

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: JSON.stringify(workNightDays ?? [1]), userMode: userMode ?? "TEACHER" },
    update: {
      ...(workNightDays !== undefined && { workNightDays: JSON.stringify(workNightDays) }),
    },
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
    userMode: settings.userMode as "TEACHER" | "STUDENT",
  });
}
