import { prisma } from "@/lib/prisma";

export async function getWorkNightDays(userId: string): Promise<number[]> {
  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]" },
    update: {},
  });
  try {
    return JSON.parse(settings.workNightDays);
  } catch {
    return [1];
  }
}
