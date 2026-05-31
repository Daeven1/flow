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
      max_tokens: 4096,
      system: `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null", "url": "https://... or null"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If the brain dump mentions a date, day, or deadline for a task, extract it as an ISO date string (YYYY-MM-DD) relative to today's date (${new Date().toISOString().slice(0, 10)}). If no date is mentioned, set deadline to null. URL EXTRACTION: If a URL (starting with http:// or https://) appears in the brain dump in the context of a task, put it in that task's url field and do NOT include the raw URL in the name field. The name should be clean and readable without any raw URLs. If no URL is associated with a task, set url to null. PRESET MATCHING (be very conservative): Only apply a preset when the task is unambiguously that exact type of professional teaching work — the user must be clearly describing grading student work, writing a rubric, preparing a specific lesson or unit, emailing a parent, submitting to MIS, etc. Do NOT apply presets to personal tasks, hobbies, travel, side projects, or anything that only superficially uses similar words. Examples of what NOT to match: "plan Italy itinerary" is NOT Lesson Planning; "code a game" is NOT Class Materials Prep; "buy supplies" is NOT Ordering. When a preset genuinely applies, name the task "Preset Name: specific detail" (e.g. "Lesson Planning: Unit 3 slides" or "Parent Email: re: missing work Gr 8"). When no preset clearly fits, use the task's literal description and infer sprint/category from context. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
      messages: [{ role: "user", content: text }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "[]";

    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch {
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        tasks = match ? JSON.parse(match[0]) : [];
      } catch {
        tasks = [];
      }
    }
    if (!Array.isArray(tasks)) tasks = [];

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("AI parse error:", error);
    return NextResponse.json({ tasks: [], error: "AI parsing failed" }, { status: 500 });
  }
}
