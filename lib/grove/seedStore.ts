// Server-only: imported by API routes, never by client components.
import { Prisma, PrismaClient } from "@prisma/client";
import { balance, SEEDS_SINCE } from "./seeds";

/** The Prisma client, or the client handed to an interactive transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Makes sure the user's seed counter exists. When the UserSettings row is
 * missing or seedsEarned is still null, it is set to the number of tasks the
 * user finished since SEEDS_SINCE. Safe when two requests race: the upsert
 * creates the row at most once, and only one updateMany sees seedsEarned null.
 *
 * Returns true when this call did the counting (so the count already reflects
 * the current state of every task).
 */
async function ensureCounter(db: Db, userId: string): Promise<boolean> {
  try {
    await db.userSettings.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  } catch (e) {
    // Another request created the row between our check and insert: fine.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }

  const settings = await db.userSettings.findUnique({
    where: { id: userId },
    select: { seedsEarned: true },
  });
  if (settings?.seedsEarned != null) return false;

  const count = await db.task.count({
    where: { userId, done: true, doneAt: { gte: SEEDS_SINCE } },
  });
  const res = await db.userSettings.updateMany({
    where: { id: userId, seedsEarned: null },
    data: { seedsEarned: count },
  });
  return res.count === 1;
}

/**
 * Adds delta seeds (+1 for a tick, -1 for an untick). Call after the task
 * change is saved. If this call is the one that first counts the user's
 * finished tasks, that count already includes the change, so nothing more is
 * added.
 */
export async function addSeeds(db: Db, userId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const counted = await ensureCounter(db, userId);
  if (counted) return;
  await db.userSettings.update({
    where: { id: userId },
    data: { seedsEarned: { increment: delta } },
  });
}

/** Seeds the user can spend now: earned minus spent on plants, never below 0. */
export async function seedBalance(db: Db, userId: string): Promise<number> {
  await ensureCounter(db, userId);
  const [settings, spent] = await Promise.all([
    db.userSettings.findUnique({ where: { id: userId }, select: { seedsEarned: true } }),
    db.focusSession.aggregate({ where: { userId }, _sum: { plantCost: true } }),
  ]);
  return balance(settings?.seedsEarned ?? 0, spent._sum.plantCost ?? 0);
}
