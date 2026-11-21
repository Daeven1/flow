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
 * Returns the current seedsEarned, and whether this call did the counting (so
 * the count already reflects the current state of every task).
 */
async function ensureCounter(
  db: Db,
  userId: string
): Promise<{ earned: number; counted: boolean }> {
  let settings = await db.userSettings.findUnique({
    where: { id: userId },
    select: { seedsEarned: true },
  });
  if (settings?.seedsEarned != null) return { earned: settings.seedsEarned, counted: false };

  if (!settings) {
    try {
      await db.userSettings.upsert({
        where: { id: userId },
        create: { id: userId },
        update: {},
      });
    } catch (e) {
      // Another request created the row first: fine. (Inside an interactive
      // transaction this can't recover: Postgres aborts the transaction.)
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }

  const count = await db.task.count({
    where: { userId, done: true, doneAt: { gte: SEEDS_SINCE } },
  });
  const res = await db.userSettings.updateMany({
    where: { id: userId, seedsEarned: null },
    data: { seedsEarned: count },
  });
  if (res.count === 1) return { earned: count, counted: true };

  // Another request counted first: use its value.
  settings = await db.userSettings.findUnique({
    where: { id: userId },
    select: { seedsEarned: true },
  });
  return { earned: settings?.seedsEarned ?? 0, counted: false };
}

/**
 * Adds delta seeds (+1 for a tick, -1 for an untick). Call after the task
 * change is saved. If this call is the one that first counts the user's
 * finished tasks, that count already includes the change, so nothing more is
 * added.
 */
export async function addSeeds(db: Db, userId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const { counted } = await ensureCounter(db, userId);
  if (counted) return;
  await db.userSettings.update({
    where: { id: userId },
    data: { seedsEarned: { increment: delta } },
  });
}

/** Seeds the user can spend now: earned minus spent on plants, never below 0. */
export async function seedBalance(db: Db, userId: string): Promise<number> {
  const { earned } = await ensureCounter(db, userId);
  const spent = await db.focusSession.aggregate({ where: { userId }, _sum: { plantCost: true } });
  return balance(earned, spent._sum.plantCost ?? 0);
}
