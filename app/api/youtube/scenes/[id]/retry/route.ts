import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { generateImage } from "../../../../../../lib/media";
import { TokenAllocator } from "../../../../../../lib/youtube/token-allocator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const scene = await prisma.youtubeScene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

    await prisma.youtubeScene.update({ where: { id }, data: { status: "GENERATING" } });

    const allocator = await TokenAllocator.create();
    // Use a different token than the original attempt — round-robin from scene number + 1
    const preferredToken = allocator.at(scene.sceneNumber + 1);

    let prompt = scene.visualPrompt;
    if (scene.environment) prompt += `, set in ${scene.environment}`;
    if (scene.metaphorElement) prompt += `, featuring ${scene.metaphorElement} as a symbolic element`;
    prompt += ", cinematic photography, 8K ultra-detailed, dramatic lighting, film grain, anamorphic lens, shallow depth of field, highly detailed textures";

    try {
      const result = await generateImage(prompt, "black-forest-labs/FLUX.1-dev", {
        width: 1920,
        height: 1080,
        hfToken: preferredToken,
      });

      // Update the scene's image URL
      await prisma.youtubeScene.update({
        where: { id },
        data: { imageUrl: result.url, status: "DONE" },
      });

      // Replace any prior IMAGE asset for this scene
      await prisma.youtubeAsset.deleteMany({ where: { sceneId: id, type: "IMAGE" } });
      await prisma.youtubeAsset.create({
        data: {
          projectId: scene.projectId,
          sceneId: id,
          type: "IMAGE",
          url: result.url,
          prompt,
          width: 1920,
          height: 1080,
          provider: result.provider,
          model: result.model,
          qualityScore: 0.85,
          metadata: JSON.stringify({
            tokenUsed: result.tokenUsed,
            exhaustedKeys: result.exhaustedKeys,
            attemptedKeys: result.attemptedKeys,
            isRetry: true,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        scene: { id, imageUrl: result.url, status: "DONE" },
        tokenUsed: result.tokenUsed,
        provider: result.provider,
        exhaustedKeys: result.exhaustedKeys,
      });
    } catch (e: any) {
      await prisma.youtubeScene.update({ where: { id }, data: { status: "FAILED" } });
      return NextResponse.json({ error: e.message?.substring(0, 400) ?? "Generation failed" }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
