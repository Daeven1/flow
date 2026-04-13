import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const client = new Anthropic();

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ tasks: [] });
  }

  const presets = await prisma.taskPreset.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  const presetsContext =
    presets.length > 0
      ? `\n\nUser's personal task timing presets (use these for matching task types):\n${presets
          .map((p) => `- "${p.name}": sprint ${p.sprint}, ${p.estMinutes} mins, ${p.workCategory === "GRADING" ? "work night" : "prep period"}`)
          .join("\n")}`
      : "";

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If a task matches a preset name or type closely, use that preset's sprint, estMinutes, and workCategory. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
      messages: [{ role: "user", content: text }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "[]";

    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      tasks = match ? JSON.parse(match[0]) : [];
    }

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("AI parse error:", error);
    return NextResponse.json({ tasks: [], error: "AI parsing failed" }, { status: 500 });
  }
}
