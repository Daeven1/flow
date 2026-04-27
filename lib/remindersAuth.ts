import { timingSafeEqual } from "crypto";

export function validateApiKey(req: Request): string | null {
  const key = req.headers.get("x-api-key");
  if (!key) return null;

  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) return null;

  const userId = key.slice(0, dotIndex);
  const secret = key.slice(dotIndex + 1);

  const expected = process.env.SHORTCUTS_SECRET;
  if (!expected || !userId) return null;

  if (secret.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) return null;

  return userId;
}
