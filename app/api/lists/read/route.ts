export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.readItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, genre, avgRating, authors, thumbnail } = await req.json();

  const item = await prisma.readItem.create({
    data: {
      userId,
      title: title ?? "",
      genre: genre ?? "",
      avgRating: avgRating ?? null,
      authors: authors ?? "",
      thumbnail: thumbnail ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
