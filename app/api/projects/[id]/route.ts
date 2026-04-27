export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id, userId },
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, deadline, notes, sortOrder, active } = body;

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = name;
  if ("deadline" in body) data.deadline = deadline ? new Date(deadline) : null;
  if ("notes" in body) data.notes = notes;
  if ("sortOrder" in body) data.sortOrder = Number(sortOrder);
  if ("active" in body) data.active = Boolean(active);

  const project = await prisma.project.update({
    where: { id, userId },
    data,
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  return NextResponse.json(project);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.project.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
