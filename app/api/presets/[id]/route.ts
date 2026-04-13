import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("sprint" in body) data.sprint = Number(body.sprint);
  if ("estMinutes" in body) data.estMinutes = Number(body.estMinutes);
  if ("workCategory" in body) data.workCategory = body.workCategory;
  if ("notes" in body) data.notes = body.notes;

  const preset = await prisma.taskPreset.update({
    where: { id: params.id, userId },
    data,
  });
  return NextResponse.json(preset);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.taskPreset.delete({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
