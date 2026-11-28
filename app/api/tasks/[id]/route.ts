export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";
import { validateApiKey } from "@/lib/remindersAuth";
import { addSeeds } from "@/lib/grove/seedStore";
import { tickDelta } from "@/lib/grove/seeds";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // fallback to API key auth for iOS Shortcuts reminderId write-back
  const userId = (await getUser()) ?? validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("done" in body && typeof body.done !== "boolean") {
    return NextResponse.json({ error: "done must be a boolean" }, { status: 400 });
  }

  if ("pinned" in body) data.pinned = Boolean(body.pinned);
  if ("schedulePinned" in body) data.schedulePinned = Boolean(body.schedulePinned);
  if ("showInRegular" in body) data.showInRegular = Boolean(body.showInRegular);
  if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder);
  if ("name" in body) data.name = body.name;
  if ("sprint" in body) data.sprint = Number(body.sprint);
  if ("estMinutes" in body) data.estMinutes = Number(body.estMinutes);
  if ("actualMinutes" in body)
    data.actualMinutes = body.actualMinutes ? Number(body.actualMinutes) : null;
  if ("workCategory" in body) data.workCategory = body.workCategory;
  if ("context" in body && body.context != null) data.context = body.context;
  if ("leadDays" in body) data.leadDays = Number(body.leadDays);
  if ("reminderId" in body) data.reminderId = body.reminderId ?? null;
  if ("url" in body) data.url = body.url || null;

  if ("deadline" in body) {
    data.deadline = body.deadline ? new Date(body.deadline) : null;

    const existing = await prisma.task.findUnique({ where: { id, userId } });
    // A day chosen by hand on the calendar outranks the derived schedule
    const pinned =
      "schedulePinned" in body
        ? Boolean(body.schedulePinned)
        : Boolean(existing?.schedulePinned);

    if (!pinned && !("scheduledDate" in body)) {
      if (body.deadline) {
        const workNightDays = await getWorkNightDays(userId);
        data.scheduledDate = computeScheduledDate(
          new Date(body.deadline),
          (body.workCategory ?? existing?.workCategory ?? "STANDARD") as string,
          Number(body.estMinutes ?? existing?.estMinutes ?? 30),
          workNightDays
        );
      } else {
        data.scheduledDate = null;
      }
    }
  }

  if ("scheduledDate" in body) {
    data.scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : null;
  }

  const where = { id, userId };
  const include = { project: true };
  if (!("done" in body)) {
    return NextResponse.json(await prisma.task.update({ where, data, include }));
  }

  const result = await prisma.$transaction(async (tx) => {
    // The native check-off uses the same row lock. Read the prior state after
    // acquiring it so two devices cannot both earn a seed for one change.
    const [before] = await tx.$queryRaw<{ done: boolean; doneAt: Date | null }[]>`
      SELECT "done", "doneAt" FROM "Task"
      WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
    `;
    if (!before) return null;
    const changed = before.done !== body.done;
    if (changed) {
      data.done = body.done;
      data.doneAt = body.done ? new Date() : null;
    }
    // A replay must preserve both doneAt and the task row version. Combined
    // requests can still edit other fields on an already-completed task.
    const task = Object.keys(data).length
      ? await tx.task.update({ where, data, include })
      : await tx.task.findUniqueOrThrow({ where, include });
    if (changed) await addSeeds(tx, userId, tickDelta(before, body.done));
    return { task, changed };
  });
  if (!result) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(result.task, {
    headers: { "Grove-Completion-Changed": result.changed ? "1" : "0" },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.task.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
