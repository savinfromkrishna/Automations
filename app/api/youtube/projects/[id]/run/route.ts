import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { runYoutubeProjectPipeline } from "../../../../../../lib/youtube/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

const ACTIVE_STATUSES = new Set([
  "RESEARCHING", "SCRIPTING", "STORYBOARDING",
  "GENERATING_VISUALS", "GENERATING_AUDIO",
  "SEO_OPTIMIZATION", "QUALITY_CHECK", "THUMBNAIL_CREATION",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as { startFromStage?: string }));
    const project = await prisma.youtubeProject.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    if (ACTIVE_STATUSES.has(project.status)) {
      return NextResponse.json({ error: "Project is already running", status: project.status }, { status: 409 });
    }

    // Clear error state but DO NOT reset status — the orchestrator will resume from
    // whatever stages have already completed in the DB.
    await prisma.youtubeProject.update({
      where: { id },
      data: { errorMessage: null },
    });

    // Fire-and-forget the pipeline. The orchestrator persists state at every step,
    // so this request can return immediately while the worker runs.
    const startFromStage = body?.startFromStage as any;
    runYoutubeProjectPipeline(id, startFromStage ? { startFromStage } : {}).catch(err => {
      console.error(`Pipeline error for ${id}:`, err.message);
    });

    return NextResponse.json({
      projectId: id,
      status: "RESUMING",
      resumingFrom: startFromStage ?? "auto-detected",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
