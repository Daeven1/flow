export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { TEACHER_DEFAULT_PRESETS, STUDENT_DEFAULT_PRESETS } from "@/lib/presetDefaults";

async function seedPresetsIfEmpty(userId: string) {
  const count = await prisma.taskPreset.count({ where: { userId } });
  if (count > 0) return;
  const settings = await prisma.userSettings.findUnique({ where: { id: userId } });
  const presets = settings?.userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;
  await prisma.taskPreset.createMany({
    data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
  });
}

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await seedPresetsIfEmpty(userId);
  const presets = await prisma.taskPreset.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(presets);
}

export async function DELETE() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { id: userId } });
  const presets = settings?.userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;

  await prisma.taskPreset.deleteMany({ where: { userId } });
  await prisma.taskPreset.createMany({
    data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const count = await prisma.taskPreset.count({ where: { userId } });
  const preset = await prisma.taskPreset.create({
    data: {
      userId,
      name: body.name,
      sprint: Number(body.sprint) ?? 4,
      estMinutes: Number(body.estMinutes) ?? 30,
      workCategory: body.workCategory ?? "STANDARD",
      notes: body.notes ?? "",
      sortOrder: count,
    },
  });
  return NextResponse.json(preset, { status: 201 });
}
