export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseStart } from "@/lib/focus/validate";

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const input = parseStart(body);
  if (!input) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const session = await prisma.focusSession.create({
    data: {
      userId,
      startedAt: input.startedAt,
      plannedMinutes: input.plannedMinutes,
      rule: input.rule,
      taskIds: JSON.stringify(input.taskIds),
    },
  });

  return NextResponse.json({ id: session.id }, { status: 201 });
}
