import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  const status = searchParams.get("status");

  try {
    const ideas = await prisma.youtubeIdea.findMany({
      where: {
        ...(channelId ? { channelId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { opportunityScore: "desc" },
      take: 50,
    });
    return NextResponse.json({ ideas });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idea = await prisma.youtubeIdea.create({
      data: {
        channelId: body.channelId,
        title: body.title,
        concept: body.concept,
        hook: body.hook,
        emotionalAngle: body.emotionalAngle,
        targetEmotion: body.targetEmotion,
        metaphorSeed: body.metaphorSeed,
        trendScore: body.trendScore ?? 0,
        viralityScore: body.viralityScore ?? 0,
        competitionScore: body.competitionScore ?? 0,
        opportunityScore: body.opportunityScore ?? 0,
        keywords: body.keywords ? JSON.stringify(body.keywords) : null,
        status: "NEW",
      },
    });
    return NextResponse.json({ idea }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const idea = await prisma.youtubeIdea.update({
      where: { id: body.id },
      data: { status: body.status },
    });
    return NextResponse.json({ idea });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
