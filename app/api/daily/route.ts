export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam ? startOfDay(new Date(dateParam)) : startOfDay(new Date());

  // ?lastForage=1 → the most recent Forage order saved before this date,
  // so a hand-dragged order carries over into new days.
  if (searchParams.get("lastForage")) {
    const prev = await prisma.dailyLog.findFirst({
      where: { userId, date: { lt: date }, forageOrder: { notIn: ["", "[]"] } },
      orderBy: { date: "desc" },
      select: { forageOrder: true },
    });
    return NextResponse.json({ forageOrder: prev?.forageOrder ?? "" });
  }

  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date } },
  });
  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, highlight, highlightDone, microCommitment, microDone, brainDump, forageOrder, flaggedForageIds } = body;

  const d = startOfDay(new Date(date || new Date()));

  const log = await prisma.dailyLog.upsert({
    where: { userId_date: { userId, date: d } },
    create: {
      userId,
      date: d,
      highlight: highlight ?? "",
      highlightDone: highlightDone ?? false,
      microCommitment: microCommitment ?? "",
      microDone: microDone ?? false,
      brainDump: brainDump ?? "",
      forageOrder: forageOrder ?? "",
      flaggedForageIds: flaggedForageIds ?? "[]",
    },
    update: {
      ...(highlight !== undefined && { highlight }),
      ...(highlightDone !== undefined && { highlightDone }),
      ...(microCommitment !== undefined && { microCommitment }),
      ...(microDone !== undefined && { microDone }),
      ...(brainDump !== undefined && { brainDump }),
      ...(forageOrder !== undefined && { forageOrder }),
      ...(flaggedForageIds !== undefined && { flaggedForageIds }),
    },
  });

  return NextResponse.json(log);
}
