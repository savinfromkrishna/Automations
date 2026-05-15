import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  try {
    const tasks = await prisma.youtubeAutomationTask.findMany({
      where: channelId ? { channelId } : {},
      include: { channel: { select: { name: true, niche: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tasks });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const task = await prisma.youtubeAutomationTask.create({
      data: {
        channelId: body.channelId,
        isActive: body.isActive ?? true,
        frequency: body.frequency ?? "WEEKLY",
        scheduleTime: body.scheduleTime,
        daysOfWeek: body.daysOfWeek,
        autoPublish: body.autoPublish ?? false,
        requireApproval: body.requireApproval ?? true,
        enableTrendResearch: body.enableTrendResearch ?? true,
        enableAutoSEO: body.enableAutoSEO ?? true,
        videosPerRun: body.videosPerRun ?? 1,
        nextRun: new Date(Date.now() + 60000),
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const task = await prisma.youtubeAutomationTask.update({
      where: { id: body.id },
      data: {
        isActive: body.isActive,
        frequency: body.frequency,
        autoPublish: body.autoPublish,
        requireApproval: body.requireApproval,
      },
    });
    return NextResponse.json({ task });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
