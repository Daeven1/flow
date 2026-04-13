export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weeksBack = parseInt(searchParams.get("weeks") || "1");

  const now = new Date();
  const weekStart = startOfWeek(subWeeks(now, weeksBack - 1), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const doneTasks = await prisma.task.findMany({
    where: { userId, done: true, doneAt: { gte: weekStart, lte: weekEnd } },
  });

  const timeLogs = await prisma.timeLog.findMany({
    where: { task: { userId }, date: { gte: weekStart, lte: weekEnd } },
  });

  const sprintBreakdown = [1, 2, 3, 4].map((s) => {
    const logs = timeLogs.filter((l) => l.sprint === s);
    const actual = logs.reduce((sum, l) => sum + l.actualMinutes, 0);
    const est = logs.reduce((sum, l) => sum + l.estMinutes, 0);
    return { sprint: s, actual, est, count: logs.length };
  });

  const totalActual = timeLogs.reduce((sum, l) => sum + l.actualMinutes, 0);
  const s1Actual = timeLogs.filter((l) => l.sprint === 1).reduce((sum, l) => sum + l.actualMinutes, 0);
  const urgentPct = totalActual > 0 ? Math.round((s1Actual / totalActual) * 100) : 0;

  const dailyLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: weekStart, lte: weekEnd } },
    orderBy: { date: "asc" },
  });

  const weeklyLog = await prisma.weeklyLog.findFirst({
    where: { userId, weekStart: { gte: weekStart } },
  });

  return NextResponse.json({
    doneTasks: doneTasks.length,
    totalEstMinutes: timeLogs.reduce((s, l) => s + l.estMinutes, 0),
    totalActualMinutes: totalActual,
    sprintBreakdown,
    urgentPct,
    nudge: urgentPct > 60
      ? `${urgentPct}% of your time went to urgent tasks. Try protecting time for deep work next week.`
      : null,
    dailyLogs,
    weeklyLog,
  });
}
