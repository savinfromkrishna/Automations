import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const channel = await prisma.youtubeChannel.findUnique({
      where: { id },
      include: {
        projects: { orderBy: { createdAt: "desc" }, take: 10 },
        memories: { orderBy: { confidence: "desc" }, take: 20 },
        automationTasks: true,
        _count: { select: { projects: true, ideas: true } },
      },
    });
    if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ channel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const channel = await prisma.youtubeChannel.update({
      where: { id },
      data: {
        name: body.name,
        handle: body.handle,
        niche: body.niche,
        subNiche: body.subNiche,
        description: body.description,
        tone: body.tone,
        style: body.style,
        targetAudience: body.targetAudience,
        brandVoice: body.brandVoice,
        visualStyle: body.visualStyle,
        publishFrequency: body.publishFrequency,
        preferredDuration: body.preferredDuration,
        isActive: body.isActive,
      },
    });
    return NextResponse.json({ channel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.youtubeChannel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
