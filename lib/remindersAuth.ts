export function validateApiKey(req: Request): string | null {
  const key = req.headers.get("x-api-key");
  if (!key) return null;

  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) return null;

  const userId = key.slice(0, dotIndex);
  const secret = key.slice(dotIndex + 1);

  if (!process.env.SHORTCUTS_SECRET || secret !== process.env.SHORTCUTS_SECRET) return null;
  if (!userId) return null;

  return userId;
}
