export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardFor, topTasks } from "@/lib/pocket/idle";

// The idle page for a pocket e-paper board that is away from home (at home it asks JARVIS
// on the Mac mini instead). Read-only. Not a Supabase session: the board sends its id and
// its own token, and may only read the one account POCKET_BOARDS lists for it.
//
//   GET /api/pocket/idle
//   Device-Id: <the board's MAC>          Authorization: Bearer <that board's token>
//   200 {"as_of": "17:42", "owner": "David", "grove": "ok",
//        "tasks": [{"title": "...", "due": "today", "due_abs": "Thu 19 Nov"}]}

const DAYS = 14;

export async function GET(req: Request) {
  const board = boardFor(
    process.env.POCKET_BOARDS,
    req.headers.get("device-id"),
    req.headers.get("authorization"),
  );
  if (!board) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  // Grove stores date-only values at UTC midnight, so "today" is the Shanghai calendar
  // date expressed at UTC midnight; a deadline due today stays on the page all day.
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  const startOfToday = new Date(`${ymd}T00:00:00Z`);
  const until = new Date(now.getTime() + DAYS * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text FROM auth.users WHERE lower(email) = ${board.email}`;
    const ids = rows.map((r) => r.id);
    const tasks = ids.length
      ? await prisma.task.findMany({
          where: {
            userId: { in: ids },
            done: false,
            OR: [
              { deadline: { gte: startOfToday, lte: until } },
              { scheduledDate: { gte: startOfToday, lte: until } },
            ],
          },
          select: { name: true, deadline: true, scheduledDate: true },
        })
      : [];
    const asOf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    return NextResponse.json(
      { as_of: asOf, owner: board.owner, grove: "ok", tasks: topTasks(tasks, now) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("pocket/idle failed", err);
    return NextResponse.json({ error: "Upstream error" }, { status: 500 });
  }
}
