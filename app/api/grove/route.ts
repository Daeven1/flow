export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isSpecies, witherExpiry } from "@/lib/grove/layout";
import type { GrovePlant, PlantStatus } from "@/lib/grove/layout";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = Number.parseInt(new URL(req.url).searchParams.get("tz") ?? "", 10);
  const tz = Number.isNaN(raw) ? 0 : Math.min(840, Math.max(-840, raw));

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
    }));

  return NextResponse.json({ plants });
}
