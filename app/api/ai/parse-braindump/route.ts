export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(req: Request) {
  const client = new Anthropic();
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
      system: `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If the brain dump mentions a date, day, or deadline for a task, extract it as an ISO date string (YYYY-MM-DD) relative to today's date (${new Date().toISOString().slice(0, 10)}). If no date is mentioned, set deadline to null. If a task matches a preset name or type closely, use that preset's sprint, estMinutes, and workCategory — and name the task as "Preset Name: specific context from brain dump" (e.g. "Lesson Planning: Unit 3 slides and materials" or "Parent Email: re: missing work Grade 8"). Always append context after a colon so the preset name is given meaning. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
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
