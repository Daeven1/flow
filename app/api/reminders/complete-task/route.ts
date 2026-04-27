export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";

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

  if (!task) {
    return NextResponse.json({ success: true }); // no-op: task deleted or not found
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { done: true, doneAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
