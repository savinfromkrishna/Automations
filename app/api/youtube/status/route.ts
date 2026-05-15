import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  try {
    const [channels, projects, ideas, memories, assets] = await Promise.all([
      prisma.youtubeChannel.count(),
      prisma.youtubeProject.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.youtubeIdea.count(),
      prisma.youtubeMemory.count(),
      prisma.youtubeAsset.count(),
    ]);

    const projectsByStatus = Object.fromEntries(
      projects.map(p => [p.status, p._count.id])
    );

    const activeCount = (projectsByStatus["RESEARCHING"] ?? 0)
      + (projectsByStatus["SCRIPTING"] ?? 0)
      + (projectsByStatus["STORYBOARDING"] ?? 0)
      + (projectsByStatus["GENERATING_VISUALS"] ?? 0)
      + (projectsByStatus["GENERATING_AUDIO"] ?? 0)
      + (projectsByStatus["SEO_OPTIMIZATION"] ?? 0)
      + (projectsByStatus["QUALITY_CHECK"] ?? 0)
      + (projectsByStatus["THUMBNAIL_CREATION"] ?? 0);

    return NextResponse.json({
      channels,
      projectsByStatus,
      activeProjects: activeCount,
      totalIdeas: ideas,
      totalMemories: memories,
      totalAssets: assets,
      healthy: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, healthy: false }, { status: 500 });
  }
}
