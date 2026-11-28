export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { OWNER_HEADER } from "@/lib/focus/accountStorage";
import { parseStart } from "@/lib/focus/validate";
import { isSpecies, type GrovePlant } from "@/lib/grove/layout";
import { NO_PLANT, fallbackPlant, replayedStart, resolvePlant, type ResolvedPlant } from "@/lib/grove/planting";
import { namedPlantStartsEnabled } from "@/lib/grove/rollout.server";
import { isLegacySpecies } from "@/lib/grove/species";
import { costOf } from "@/lib/grove/seeds";
import { seedBalance } from "@/lib/grove/seedStore";

/** The user's plant a tend names, shaped for canTend, or null when missing. */
async function findTree(tx: Prisma.TransactionClient, userId: string, id: string): Promise<GrovePlant | null> {
  const row = await tx.grovePlant.findFirst({ where: { id, userId } });
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
  const expectedOwner = req.headers.get(OWNER_HEADER);
  if (!userId || (expectedOwner !== null && expectedOwner !== userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const input = parseStart(body);
  if (!input) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const choice = input.plant;
  const newNamedPlant = choice !== null && choice.tendId === undefined && !isLegacySpecies(choice.species);
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

  function storeStart(resolve: (tx: Prisma.TransactionClient) => Promise<ResolvedPlant & { dropReason?: "ERROR" }>) {
    return prisma.$transaction(async (tx) => {
      // Free, paid, and fallback starts share the same account lock. After a
      // wait the following read must see the preceding transaction's commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${base.userId}))`;
      const existing = await tx.focusSession.findFirst(stored);
      if (existing) {
        const replay = replayedStart(existing, choice);
        // Plain sessions do not store a decline reason. A retry must not infer a
        // seed shortage for a named plant that may have been disabled at start.
        return !replay.plantAccepted && newNamedPlant ? { ...replay, dropReason: "UNAVAILABLE" } : replay;
      }

      // Apply to both the normal and fallback transaction, before any balance
      // lookup or plant write. Existing owned trees still use the tend checks.
      const resolved = newNamedPlant && !namedPlantStartsEnabled()
        ? { ...NO_PLANT, accepted: false, dropReason: "UNAVAILABLE" as const }
        : await resolve(tx);
      const { accepted, dropReason, ...plant } = resolved;
      const session = await tx.focusSession.create({ data: { ...base, ...plant } });
      return { id: session.id, plantAccepted: accepted, ...(dropReason ? { dropReason } : {}) };
    }, { isolationLevel: "ReadCommitted" });
  }

  let result;
  try {
    result = await storeStart(async (tx) => {
      const tree = choice?.tendId !== undefined ? await findTree(tx, userId, choice.tendId) : null;
      const balance = costOf(choice) > 0 ? await seedBalance(tx, userId) : null;
      return resolvePlant(choice, tree, balance);
    });
  } catch (e) {
    // A plant failure (including an aborted Postgres transaction) need not
    // lose the timer. A new transaction also handles an uncertain commit.
    console.error("focus session start: plant step failed, starting with only a free plant", e);
    result = await storeStart(async () => fallbackPlant(choice));
  }
  return NextResponse.json(result.plantAccepted && choice?.species === "CHICORY"
    ? { ...result, acceptedSpecies: choice.species } : result, { status: 201 });
}
