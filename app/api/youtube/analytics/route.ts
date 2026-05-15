import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");

  try {
    const [projects, memories, ideas, analytics] = await Promise.all([
      prisma.youtubeProject.findMany({
        where: channelId ? { channelId } : {},
        select: { id: true, title: true, status: true, trendScore: true, viralityScore: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      channelId ? prisma.youtubeMemory.count({ where: { channelId } }) : prisma.youtubeMemory.count(),
      channelId ? prisma.youtubeIdea.count({ where: { channelId } }) : prisma.youtubeIdea.count(),
      prisma.youtubeAnalytics.findMany({
        where: channelId ? { channelId } : {},
        orderBy: { recordedAt: "desc" },
        take: 50,
      }),
    ]);

    const statusCounts = projects.reduce((acc: Record<string, number>, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ projects, statusCounts, memoriesCount: memories, ideasCount: ideas, analytics });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const record = await prisma.youtubeAnalytics.create({
      data: {
        channelId: body.channelId,
        projectId: body.projectId,
        ytVideoId: body.ytVideoId,
        views: body.views ?? 0,
        watchTimeMinutes: body.watchTimeMinutes ?? 0,
        avgViewDuration: body.avgViewDuration ?? 0,
        avgViewPercent: body.avgViewPercent ?? 0,
        likes: body.likes ?? 0,
        comments: body.comments ?? 0,
        shares: body.shares ?? 0,
        ctr: body.ctr ?? 0,
        impressions: body.impressions ?? 0,
        subscribersGained: body.subscribersGained ?? 0,
      },
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
