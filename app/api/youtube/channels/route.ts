import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  try {
    const channels = await prisma.youtubeChannel.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { projects: true, ideas: true, memories: true },
        },
      },
    });
    return NextResponse.json({ channels });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channel = await prisma.youtubeChannel.create({
      data: {
        name: body.name,
        handle: body.handle,
        niche: body.niche,
        subNiche: body.subNiche,
        description: body.description,
        tone: body.tone ?? "cinematic",
        style: body.style ?? "metaphorical",
        targetAudience: body.targetAudience,
        brandVoice: body.brandVoice,
        visualStyle: body.visualStyle,
        publishFrequency: body.publishFrequency ?? "WEEKLY",
        preferredDuration: body.preferredDuration ?? 8,
      },
    });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
