export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";
import { addSeeds } from "@/lib/grove/seedStore";

export async function PATCH(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { reminder_id } = body;

  if (!reminder_id) {
    return NextResponse.json({ error: "Missing required field: reminder_id" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { userId_reminderId: { userId, reminderId: reminder_id } },
  });

  if (!task || task.done) {
    return NextResponse.json({ success: true }); // no-op: task deleted, not found, or already done
  }

  // Conditional, so a duplicate Shortcut call can't mark it done (and earn a seed) twice
  const marked = await prisma.task.updateMany({
    where: { id: task.id, userId, done: false },
    data: { done: true, doneAt: new Date() },
  });

  if (marked.count === 1) {
    try {
      await addSeeds(prisma, userId, 1);
    } catch (e) {
      console.error("addSeeds failed", e);
    }
  }

  return NextResponse.json({ success: true });
}
