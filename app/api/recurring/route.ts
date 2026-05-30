export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.recurringTask.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name, sprint, estMinutes, workCategory, context,
    recurrenceType, recurrenceDays, recurrenceMonthDay, deadlineOffset,
  } = body;

  if (!name || !recurrenceType) {
    return NextResponse.json({ error: "name and recurrenceType are required" }, { status: 400 });
  }

  const template = await prisma.recurringTask.create({
    data: {
      userId,
      name,
      sprint: Number(sprint) || 1,
      estMinutes: Number(estMinutes) || 30,
      workCategory: workCategory ?? "STANDARD",
      context: context ?? "PROFESSIONAL",
      recurrenceType,
      recurrenceDays: recurrenceDays ?? "[]",
      recurrenceMonthDay: recurrenceMonthDay ? Number(recurrenceMonthDay) : null,
      deadlineOffset: Number(deadlineOffset) || 0,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
