import { getUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await getUser()) return new Response(null, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  const key = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  if (!query || !key) return Response.json({ items: [] });
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.search = new URLSearchParams({ q: query.slice(0, 300), maxResults: "6", key }).toString();
  const result = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!result.ok) return new Response(null, { status: 502 });
  return Response.json(await result.json());
}
