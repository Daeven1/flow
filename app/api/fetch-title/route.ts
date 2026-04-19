export const runtime = 'nodejs';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url || !/^https:\/\/.+/.test(url)) {
    return NextResponse.json({ title: null });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FlowApp/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ title: null });

    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = match ? match[1].trim().replace(/\s+/g, " ") : null;

    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: null });
  }
}
