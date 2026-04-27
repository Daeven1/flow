export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";

export async function GET(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [needsReminder, needsCompletion] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        syncedFrom: "app",
        reminderId: null,
        done: false,
      },
      select: { id: true, name: true, deadline: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        syncedFrom: "app",
        done: true,
        NOT: { reminderId: null },
      },
      select: { id: true, name: true, reminderId: true },
    }),
  ]);

  return NextResponse.json({ needsReminder, needsCompletion });
}
