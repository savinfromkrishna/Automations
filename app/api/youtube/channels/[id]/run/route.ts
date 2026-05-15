import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { createProjectFromIdea, runYoutubeProjectPipeline } from "../../../../../../lib/youtube/orchestrator";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = await createProjectFromIdea(id, {
      concept: body.concept,
      title: body.title,
    });
    // Run pipeline async
    runYoutubeProjectPipeline(projectId).catch(err => {
      console.error(`Pipeline error for ${projectId}:`, err.message);
    });
    return NextResponse.json({ projectId, status: "STARTED" }, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
