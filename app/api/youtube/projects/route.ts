import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  try {
    const projects = await prisma.youtubeProject.findMany({
      where: {
        ...(channelId ? { channelId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        script: { select: { hook: true, retentionScore: true, emotionScore: true, estimatedDuration: true } },
        seo: { select: { title: true, ctrPrediction: true, primaryKeyword: true } },
        _count: { select: { assets: true, scenes: true, agentLogs: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const project = await prisma.youtubeProject.create({
      data: {
        channelId: body.channelId,
        concept: body.concept,
        title: body.title,
        status: "IDEA",
        priority: body.priority ?? 5,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
