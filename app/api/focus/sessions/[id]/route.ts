export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { OWNER_HEADER } from "@/lib/focus/accountStorage";
import { parseEnd } from "@/lib/focus/validate";
import { MAX_STAGE, witherExpiry } from "@/lib/grove/layout";
import { planFor } from "@/lib/grove/planting";
import { timeEntryId } from "@/lib/timeEntry";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  const expectedOwner = req.headers.get(OWNER_HEADER);
  if (!userId || (expectedOwner !== null && expectedOwner !== userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    if (claimed.count === 0) return;

    // Only the request that won the claim tends, so a retry raises a stage once.
    // A lost tend changes nothing; a tended tree never dies or shrinks.
    if (session.tendPlantId !== null && logTime) {
      await tx.grovePlant.updateMany({
        where: { id: session.tendPlantId, userId, status: "ALIVE", stage: { lt: MAX_STAGE } },
        data: { stage: { increment: 1 } },
      });
    }

    // Only the request that won the claim plants (never for a tend).
    // skipDuplicates (ON CONFLICT DO NOTHING on sessionId) keeps a duplicate
    // from aborting the transaction.
    if (session.tendPlantId === null) {
      const now = new Date();
      const existing = await tx.grovePlant.findMany({
        where: { userId },
        select: { x: true, y: true, status: true, witheredAt: true },
      });
      const occupied = existing.filter(
        (p) =>
          p.status === "ALIVE" ||
          (p.witheredAt !== null && witherExpiry(p.witheredAt, input.tz) > now),
      );
      const plant = planFor(session, input.outcome, input.endedAt, occupied);
      if (plant) {
        await tx.grovePlant.createMany({ data: [{ ...plant, userId }], skipDuplicates: true });
      }
    }

    if (!logTime) return;

    for (const seg of input.segments) {
      const task = await tx.task.findFirst({ where: { id: seg.taskId, userId } });
      if (!task) continue;
      await tx.timeLog.create({
        data: {
          id: timeEntryId("focus", randomUUID()),
          taskId: task.id,
          taskName: task.name,
          sprint: task.sprint,
          estMinutes: task.estMinutes,
          actualMinutes: seg.minutes,
          date: input.endedAt,
        },
      });
      // A delayed session can land while a task total is being corrected.
      // Apply the earned minutes to the latest total inside the database.
      const first = await tx.task.updateMany({
        where: { id: task.id, actualMinutes: null },
        data: { actualMinutes: seg.minutes },
      });
      if (!first.count) {
        await tx.task.update({ where: { id: task.id }, data: { actualMinutes: { increment: seg.minutes } } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
