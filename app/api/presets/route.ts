export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const DEFAULT_PRESETS = [
  { name: "Lesson Planning",                  sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "activities, slides, materials, UDL" },
  { name: "Collaborative Planning",           sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "unit design, resource creation, alignment" },
  { name: "Unit Building",                    sprint: 4, estMinutes: 90,  workCategory: "STANDARD", notes: "task-specific rubrics, concepts, timelines" },
  { name: "Formative Feedback",               sprint: 2, estMinutes: 100, workCategory: "GRADING",  notes: "per class" },
  { name: "Summative Assessment",             sprint: 2, estMinutes: 100, workCategory: "GRADING",  notes: "per class" },
  { name: "Moderation",                       sprint: 2, estMinutes: 60,  workCategory: "GRADING",  notes: "" },
  { name: "Lesson/Tools/Materials Setup",     sprint: 1, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Materials Prep",                   sprint: 3, estMinutes: 30,  workCategory: "STANDARD", notes: "wood, plywood, acrylic, cardboard, robots, etc." },
  { name: "Check Missing Work",               sprint: 1, estMinutes: 10,  workCategory: "STANDARD", notes: "beginning of class" },
  { name: "Advisory Prep",                    sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Parent Email",                     sprint: 3, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Unit Newsletter",                  sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Pre-Unit Reflection",              sprint: 4, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Mid-Unit Reflection",              sprint: 4, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Post-Unit Reflection",             sprint: 4, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Post Assessments",                 sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Student Spotlight / Recognition",  sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Update Timelines / Planning Docs", sprint: 3, estMinutes: 30,  workCategory: "STANDARD", notes: "" },
  { name: "Write Professional Article / Blog",sprint: 4, estMinutes: 120, workCategory: "STANDARD", notes: "" },
  { name: "Create Instructional Video",       sprint: 4, estMinutes: 90,  workCategory: "STANDARD", notes: "" },
  { name: "Practice/Learn Design Software",   sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "" },
  { name: "Reimbursement Submission",         sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "SST Tracking",                     sprint: 3, estMinutes: 20,  workCategory: "STANDARD", notes: "" },
  { name: "Monthly Budget Check-In",          sprint: 3, estMinutes: 20,  workCategory: "STANDARD", notes: "" },
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

export async function DELETE() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.taskPreset.deleteMany({ where: { userId } });
  await prisma.taskPreset.createMany({
    data: DEFAULT_PRESETS.map((p, i) => ({ ...p, userId, sortOrder: i })),
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
