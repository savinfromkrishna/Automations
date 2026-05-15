import { NextRequest, NextResponse } from "next/server";
import { getProjectWorkflowState } from "../../../../../../lib/youtube/orchestrator";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [workflow, project] = await Promise.all([
      getProjectWorkflowState(id),
      prisma.youtubeProject.findUnique({
        where: { id },
        select: {
          id: true, title: true, concept: true, status: true,
          currentStage: true, stageProgress: true, errorMessage: true,
          thumbnailUrl: true, createdAt: true, updatedAt: true,
        },
      }),
    ]);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ project, workflow });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
