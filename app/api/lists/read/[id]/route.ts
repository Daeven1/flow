export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("checked" in body) data.checked = body.checked;

  const item = await prisma.readItem.update({ where: { id, userId }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.readItem.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
