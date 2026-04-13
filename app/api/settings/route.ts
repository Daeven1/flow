export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]" },
    update: {},
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
  });
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workNightDays } = body;

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: JSON.stringify(workNightDays ?? [1]) },
    update: { workNightDays: JSON.stringify(workNightDays ?? [1]) },
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
  });
}
