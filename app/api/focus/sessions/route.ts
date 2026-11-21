export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseStart } from "@/lib/focus/validate";
import { isSpecies, type GrovePlant } from "@/lib/grove/layout";
import { fallbackPlant, replayedStart, resolvePlant } from "@/lib/grove/planting";
import { costOf } from "@/lib/grove/seeds";
import { seedBalance } from "@/lib/grove/seedStore";

/** The user's plant a tend names, shaped for canTend, or null when missing. */
async function findTree(userId: string, id: string): Promise<GrovePlant | null> {
  const row = await prisma.grovePlant.findFirst({ where: { id, userId } });
  if (!row || !isSpecies(row.species)) return null;
  return {
    id: row.id, species: row.species, x: row.x, y: row.y,
    status: row.status === "ALIVE" ? "ALIVE" : "WITHERED",
    plantedAt: row.plantedAt.toISOString(),
    witheredAt: row.witheredAt?.toISOString() ?? null,
    stage: row.stage,
  };
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const input = parseStart(body);
  if (!input) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const choice = input.plant;
  const base = {
    userId,
    startedAt: input.startedAt,
    plannedMinutes: input.plannedMinutes,
    rule: input.rule,
    taskIds: JSON.stringify(input.taskIds),
  };

  // A start sent again after its reply was lost (same user, same startedAt)
  // answers with the session already stored, so it is never charged twice.
  const stored = { where: { userId, startedAt: input.startedAt }, select: { id: true, plantSpecies: true } };

  try {
    if (choice && costOf(choice) > 0) {
      // Buying: check the balance and store the session together, one paid
      // start at a time per user, so two at once cannot spend the same seeds.
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const existing = await tx.focusSession.findFirst(stored);
        if (existing) return replayedStart(existing, choice);
        const { accepted, ...plant } = resolvePlant(choice, null, await seedBalance(tx, userId));
        const session = await tx.focusSession.create({ data: { ...base, ...plant } });
        return { id: session.id, plantAccepted: accepted };
      });
      return NextResponse.json(result, { status: 201 });
    }

    const existing = await prisma.focusSession.findFirst(stored);
    if (existing) return NextResponse.json(replayedStart(existing, choice), { status: 201 });
    const tree = choice?.tendId !== undefined ? await findTree(userId, choice.tendId) : null;
    const { accepted, ...plant } = resolvePlant(choice, tree, null);
    const session = await prisma.focusSession.create({ data: { ...base, ...plant } });
    return NextResponse.json({ id: session.id, plantAccepted: accepted }, { status: 201 });
  } catch (e) {
    // A session must always start: fall back to one that spends nothing.
    console.error("focus session start: plant step failed, starting with only a free plant", e);
  }

  const existing = await prisma.focusSession.findFirst(stored);
  if (existing) return NextResponse.json(replayedStart(existing, choice), { status: 201 });
  // A free new plant is kept (no seeds touched); a paid plant or tend is dropped.
  const { accepted, dropReason, ...plant } = fallbackPlant(choice);
  const session = await prisma.focusSession.create({ data: { ...base, ...plant } });
  return NextResponse.json(
    { id: session.id, plantAccepted: accepted, ...(dropReason ? { dropReason } : {}) },
    { status: 201 },
  );
}
