export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseEnd } from "@/lib/focus/validate";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await prisma.focusSession.findFirst({ where: { id, userId } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The client may retry: an already-ended session is left untouched.
  if (session.outcome !== null) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  const input = parseEnd(body, session.plannedMinutes);
  if (!input) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const logTime = input.outcome === "COMPLETED" || input.outcome === "CLEARED";

  await prisma.$transaction(async (tx) => {
    // Guarded on outcome still being null so a concurrent retry cannot double-log.
    const claimed = await tx.focusSession.updateMany({
      where: { id, userId, outcome: null },
      data: { outcome: input.outcome, endedAt: input.endedAt },
    });
    if (claimed.count === 0 || !logTime) return;

    for (const seg of input.segments) {
      const task = await tx.task.findFirst({ where: { id: seg.taskId, userId } });
      if (!task) continue;
      await tx.timeLog.create({
        data: {
          taskId: task.id,
          taskName: task.name,
          sprint: task.sprint,
          estMinutes: task.estMinutes,
          actualMinutes: seg.minutes,
        },
      });
      await tx.task.update({
        where: { id: task.id },
        data: { actualMinutes: (task.actualMinutes ?? 0) + seg.minutes },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
