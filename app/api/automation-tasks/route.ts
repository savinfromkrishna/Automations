import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutoGeneration } from "@/lib/automation-worker";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tasks = await prisma.automationTask.findMany({
      include: {
        team: { include: { members: { orderBy: { priority: "asc" } } } },
      },
    });
    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      niche,
      category,
      products,
      target_url,
      audience,
      tone,
      schedule_type,
      interval_hours,
      schedule_time,
      days_of_week,
      publication_lead_time_hours,
      generation_buffer_minutes,
    } = body;

    let nextRun = new Date();
    if (schedule_type === "DAILY" && schedule_time) {
      const [hours, minutes] = schedule_time.split(":").map(Number);
      nextRun.setHours(hours, minutes, 0, 0);
      if (nextRun <= new Date()) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    }

    if (days_of_week) {
      const allowedDays = days_of_week.split(",").map((d: any) => parseInt(d.trim()));
      let safetyCounter = 0;
      while (!allowedDays.includes(nextRun.getDay()) && safetyCounter < 10) {
        nextRun.setDate(nextRun.getDate() + 1);
        safetyCounter++;
      }
    }

    const task = await prisma.automationTask.create({
      data: {
        niche,
        category,
        products,
        target_url,
        audience,
        tone: tone || "Professional & Informative",
        status: "ACTIVE",
        posts_per_day: parseInt(body.posts_per_day) || 2,
        schedule_type: schedule_type || "INTERVAL",
        interval_hours: interval_hours ? parseInt(interval_hours) : 12,
        schedule_time: schedule_time || null,
        days_of_week: days_of_week || null,
        publication_lead_time_hours: parseInt(publication_lead_time_hours) || 0,
        generation_buffer_minutes: parseInt(generation_buffer_minutes) || 30,
        next_run: nextRun,
        ...(body.team_id && { team_id: parseInt(body.team_id) }),
      },
      include: {
        team: { include: { members: { orderBy: { priority: "asc" } } } },
      },
    });

    runAutoGeneration().catch((e) => console.error("[Worker] post-create cycle:", e));
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
