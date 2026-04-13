export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const DEFAULT_PRESETS = [
  { name: "Grade Criterion A (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion B (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion C (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion D (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Write parent email", sprint: 3, estMinutes: 10, workCategory: "STANDARD", notes: "" },
  { name: "Lesson setup & materials", sprint: 1, estMinutes: 20, workCategory: "STANDARD", notes: "" },
  { name: "Write report (per student)", sprint: 2, estMinutes: 5, workCategory: "GRADING", notes: "" },
  { name: "MIS data entry", sprint: 3, estMinutes: 15, workCategory: "STANDARD", notes: "" },
  { name: "HOD meeting prep", sprint: 3, estMinutes: 20, workCategory: "STANDARD", notes: "" },
  { name: "Create slide deck (1 lesson)", sprint: 4, estMinutes: 45, workCategory: "STANDARD", notes: "" },
];

async function seedPresetsIfEmpty(userId: string) {
  const count = await prisma.taskPreset.count({ where: { userId } });
  if (count > 0) return;
  await prisma.taskPreset.createMany({
    data: DEFAULT_PRESETS.map((p, i) => ({ ...p, userId, sortOrder: i })),
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
