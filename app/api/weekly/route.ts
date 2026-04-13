export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("weekStart");
  const weekStart = dateParam
    ? startOfWeek(new Date(dateParam), { weekStartsOn: 1 })
    : startOfWeek(new Date(), { weekStartsOn: 1 });

  const log = await prisma.weeklyLog.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { weekStart, highlightsDone, microsDone } = body;

  const ws = startOfWeek(new Date(weekStart), { weekStartsOn: 1 });

  const log = await prisma.weeklyLog.upsert({
    where: { userId_weekStart: { userId, weekStart: ws } },
    create: {
      userId,
      weekStart: ws,
      highlightsDone: highlightsDone ?? 0,
      microsDone: microsDone ?? 0,
    },
    update: {
      ...(highlightsDone !== undefined && { highlightsDone }),
      ...(microsDone !== undefined && { microsDone }),
    },
  });

  return NextResponse.json(log);
}
