import { generateImage } from "../../media";
import { prisma } from "../../prisma";
import { TokenAllocator } from "../token-allocator";

// FLUX.1-schnell is ~4-6× cheaper than FLUX.1-dev (4 steps vs 28) with
// quality that's excellent for YouTube scene visuals. The internal fallback
// chain in media.ts handles cases where schnell is unavailable.
const IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";

export interface VisualGenerationResult {
  sceneId: string;
  sceneNumber: number;
  imageUrl: string;
  prompt: string;
  provider: string;
  model: string;
  tokenUsed?: string;
  exhaustedKeys?: string[];
  error?: string;
}

export async function runVisualGeneratorAgent(
  projectId: string,
  scenes: Array<{ id: string; sceneNumber: number; visualPrompt: string; environment?: string | null; metaphorElement?: string | null }>
): Promise<{ results: VisualGenerationResult[]; failures: VisualGenerationResult[]; tokensUsed: string[]; tokensExhausted: string[]; totalScenes: number; successCount: number; failureCount: number }> {
  const allocator = await TokenAllocator.create();
  const results: VisualGenerationResult[] = [];
  const failures: VisualGenerationResult[] = [];
  const tokensUsed = new Set<string>();
  const tokensExhausted = new Set<string>();

  // Sort scenes by number for deterministic assignment
  const orderedScenes = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  for (let i = 0; i < orderedScenes.length; i++) {
    const scene = orderedScenes[i];
    // Deterministic per-scene token: scene N always tries token[N % poolSize] first.
    // If that token is exhausted, generateImage internally tries the others.
    const preferredToken = allocator.at(i);
    const enhancedPrompt = buildEnhancedPrompt(scene.visualPrompt, scene.environment, scene.metaphorElement);

    try {
      await prisma.youtubeScene.update({
        where: { id: scene.id },
        data: { status: "GENERATING" },
      });

      const result = await generateImage(enhancedPrompt, IMAGE_MODEL, {
        width: 1920,
        height: 1080,
        hfToken: preferredToken,
      });

      await prisma.youtubeScene.update({
        where: { id: scene.id },
        data: { imageUrl: result.url, status: "DONE" },
      });

      await prisma.youtubeAsset.create({
        data: {
          projectId,
          sceneId: scene.id,
          type: "IMAGE",
          url: result.url,
          prompt: enhancedPrompt,
          width: 1920,
          height: 1080,
          provider: result.provider,
          model: result.model,
          qualityScore: 0.85,
          metadata: JSON.stringify({
            tokenUsed: result.tokenUsed,
            exhaustedKeys: result.exhaustedKeys,
            attemptedKeys: result.attemptedKeys,
          }),
        },
      });

      if (result.tokenUsed) tokensUsed.add(result.tokenUsed);
      (result.exhaustedKeys ?? []).forEach(k => tokensExhausted.add(k));

      results.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        imageUrl: result.url,
        prompt: enhancedPrompt,
        provider: result.provider,
        model: result.model,
        tokenUsed: result.tokenUsed,
        exhaustedKeys: result.exhaustedKeys,
      });
    } catch (err: any) {
      await prisma.youtubeScene.update({
        where: { id: scene.id },
        data: { status: "FAILED" },
      });
      console.error(`[VisualAgent] Scene ${scene.sceneNumber} failed:`, err.message);
      failures.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        imageUrl: "",
        prompt: enhancedPrompt,
        provider: "",
        model: IMAGE_MODEL,
        error: (err.message ?? "Unknown error").substring(0, 300),
      });
    }
  }

  // Return a log-friendly summary (without huge data: URLs — those live in the scenes/assets tables)
  return {
    results: results.map(r => ({
      ...r,
      imageUrl: r.imageUrl.startsWith("data:") ? `<data:${r.imageUrl.length} bytes>` : r.imageUrl,
    })),
    failures,
    totalScenes: orderedScenes.length,
    successCount: results.length,
    failureCount: failures.length,
    tokensUsed: Array.from(tokensUsed),
    tokensExhausted: Array.from(tokensExhausted),
  };
}

function buildEnhancedPrompt(
  basePrompt: string,
  environment?: string | null,
  metaphorElement?: string | null
): string {
  let prompt = basePrompt;
  if (environment && !prompt.toLowerCase().includes(environment.toLowerCase().substring(0, 10))) {
    prompt += `, set in ${environment}`;
  }
  if (metaphorElement) {
    prompt += `, featuring ${metaphorElement} as a symbolic element`;
  }
  prompt += ", cinematic photography, 8K ultra-detailed, dramatic lighting, film grain, anamorphic lens, shallow depth of field, highly detailed textures";
  return prompt;
}
