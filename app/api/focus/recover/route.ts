import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OWNER_HEADER } from "@/lib/focus/accountStorage";

export const runtime = "nodejs";

type Claim = { id: string | null; startedAt: number; taskIds: string[] };

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<Claim>;
  return (claim.id === null || typeof claim.id === "string") && typeof claim.startedAt === "number" &&
    Number.isFinite(new Date(claim.startedAt).getTime()) && Array.isArray(claim.taskIds) &&
    claim.taskIds.length > 0 && claim.taskIds.every(id => typeof id === "string");
}

/** Read-only ownership check for browser saves made before account-scoped storage. */
export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId || req.headers.get(OWNER_HEADER) !== userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const claims: unknown = await req.json().catch(() => null);
  if (!Array.isArray(claims) || !claims.every(isClaim)) return NextResponse.json({ error: "Invalid claims" }, { status: 400 });

  const unconfirmed = claims.filter(claim => claim.id === null);
  const [sessions, tasks] = await Promise.all([
    prisma.focusSession.findMany({ where: { userId, startedAt: { in: claims.map(c => new Date(c.startedAt)) } },
      select: { id: true, startedAt: true, taskIds: true } }),
    unconfirmed.length ? prisma.task.findMany({ where: { userId, id: { in: unconfirmed.flatMap(c => c.taskIds) } }, select: { id: true } }) : [],
  ]);
  const taskIds = new Set(tasks.map(t => t.id));
  const owned = claims.filter(claim => {
    const recorded = sessions.some(s => s.startedAt.getTime() === claim.startedAt &&
      (claim.id !== null ? s.id === claim.id : s.taskIds === JSON.stringify(claim.taskIds)));
    return recorded || (claim.id === null && claim.taskIds.some(id => taskIds.has(id)));
  }).map(claim => claim.startedAt);
  return NextResponse.json({ owned });
}
