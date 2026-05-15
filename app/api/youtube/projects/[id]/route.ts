import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const project = await prisma.youtubeProject.findUnique({
      where: { id },
      include: {
        script: true,
        storyboard: true,
        scenes: {
          orderBy: { sceneNumber: "asc" },
          include: { assets: { where: { type: "IMAGE" }, orderBy: { createdAt: "desc" }, take: 1 } },
        },
        assets: { orderBy: { createdAt: "asc" } },
        seo: true,
        agentLogs: { orderBy: { startedAt: "desc" }, take: 50 },
        analytics: { orderBy: { recordedAt: "desc" }, take: 5 },
        channel: { select: { name: true, niche: true, tone: true, style: true } },
      },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const project = await prisma.youtubeProject.update({
      where: { id },
      data: {
        title: body.title,
        concept: body.concept,
        status: body.status,
        priority: body.priority,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
      },
    });
    return NextResponse.json({ project });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.youtubeProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
