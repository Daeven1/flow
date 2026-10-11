export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Read-only feed for the JARVIS household assistant. Not a Supabase session:
// JARVIS authenticates with a shared bearer token (JARVIS_TOKEN) and may only
// read the accounts listed in JARVIS_GROVE_EMAILS.

function authorised(req: Request): boolean {
  const expected = process.env.JARVIS_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = Number(new URL(req.url).searchParams.get("days") ?? 7);
  const days = Number.isFinite(raw) ? Math.min(31, Math.max(1, Math.trunc(raw))) : 7;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const emails = (process.env.JARVIS_GROVE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const people = [];
  for (const email of emails) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text FROM auth.users WHERE lower(email) = ${email}`;
    const ids = rows.map((r) => r.id);
    const tasks = ids.length
      ? await prisma.task.findMany({
          where: {
            userId: { in: ids },
            done: false,
            OR: [
              { deadline: { gte: now, lte: until } },
              { scheduledDate: { gte: startOfToday, lte: until } },
            ],
          },
          include: { project: true },
          orderBy: [{ deadline: "asc" }],
        })
      : [];
    people.push({
      email,
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        deadline: t.deadline ? t.deadline.toISOString() : null,
        scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
        project: t.project ? t.project.name : null,
      })),
    });
  }

  return NextResponse.json({ people });
}
