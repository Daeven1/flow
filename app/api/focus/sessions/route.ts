export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseStart } from "@/lib/focus/validate";
import { MAX_STAGE } from "@/lib/grove/layout";
import { costOf } from "@/lib/grove/seeds";
import { seedBalance } from "@/lib/grove/seedStore";

type StoredPlant = {
  plantSpecies: string | null;
  plantX: number | null;
  plantY: number | null;
  plantCost: number;
  tendPlantId: string | null;
};

const NO_PLANT: StoredPlant = {
  plantSpecies: null, plantX: null, plantY: null, plantCost: 0, tendPlantId: null,
};

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const input = parseStart(body);
  if (!input) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const choice = input.plant;

  const { session, plantAccepted } = await prisma.$transaction(async (tx) => {
    // One paid start at a time per user, so two at once cannot spend the same seeds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    let stored: StoredPlant = NO_PLANT;
    if (choice?.tendId !== undefined) {
      // Tending: only a living tree of this user's that can still grow.
      const tree = await tx.grovePlant.findFirst({
        where: { id: choice.tendId, userId },
        select: { id: true, species: true, x: true, y: true, status: true, stage: true },
      });
      if (tree && tree.species === "TREE" && tree.status === "ALIVE" && tree.stage < MAX_STAGE) {
        stored = {
          plantSpecies: tree.species, plantX: tree.x, plantY: tree.y,
          plantCost: 0, tendPlantId: tree.id,
        };
      }
    } else if (choice) {
      const cost = costOf(choice);
      if (cost === 0 || (await seedBalance(tx, userId)) >= cost) {
        stored = {
          plantSpecies: choice.species, plantX: choice.x, plantY: choice.y,
          plantCost: cost, tendPlantId: null,
        };
      }
    }

    const session = await tx.focusSession.create({
      data: {
        userId,
        startedAt: input.startedAt,
        plannedMinutes: input.plannedMinutes,
        rule: input.rule,
        taskIds: JSON.stringify(input.taskIds),
        ...stored,
      },
    });
    return { session, plantAccepted: choice === null || stored.plantSpecies !== null };
  });

  return NextResponse.json({ id: session.id, plantAccepted }, { status: 201 });
}
