export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { seedBalance } from "@/lib/grove/seedStore";
import { isSpecies, parseTz, witherExpiry } from "@/lib/grove/layout";
import type { GrovePlant, PlantStatus } from "@/lib/grove/layout";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tz = parseTz(new URL(req.url).searchParams.get("tz"));

  const now = new Date();
  const withered = await prisma.grovePlant.findMany({
    where: { userId, status: "WITHERED" },
    select: { id: true, witheredAt: true },
  });
  const expired = withered
    .filter((p) => p.witheredAt !== null && witherExpiry(p.witheredAt, tz) <= now)
    .map((p) => p.id);
  if (expired.length > 0) {
    await prisma.grovePlant.deleteMany({
      where: { userId, status: "WITHERED", id: { in: expired } },
    });
  }

  const rows = await prisma.grovePlant.findMany({
    where: { userId },
    orderBy: { plantedAt: "asc" },
  });
  const plants: GrovePlant[] = rows
    .filter((p) => isSpecies(p.species))
    .map((p) => ({
      id: p.id,
      species: p.species as GrovePlant["species"],
      x: p.x,
      y: p.y,
      status: p.status as PlantStatus,
      plantedAt: p.plantedAt.toISOString(),
      witheredAt: p.witheredAt ? p.witheredAt.toISOString() : null,
      stage: p.stage,
    }));

  return NextResponse.json({ plants, seeds: await seedBalance(prisma, userId) });
}
