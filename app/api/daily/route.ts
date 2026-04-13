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

  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date } },
  });
  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, highlight, highlightDone, microCommitment, microDone, brainDump } = body;

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
    },
    update: {
      ...(highlight !== undefined && { highlight }),
      ...(highlightDone !== undefined && { highlightDone }),
      ...(microCommitment !== undefined && { microCommitment }),
      ...(microDone !== undefined && { microDone }),
      ...(brainDump !== undefined && { brainDump }),
    },
  });

  return NextResponse.json(log);
}
