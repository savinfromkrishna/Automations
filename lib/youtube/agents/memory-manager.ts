import { prisma } from "../../prisma";
import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { ChannelMemory, MemoryType, QualityReport, GeneratedScript, SeoPackage } from "../types";

export async function retrieveChannelMemories(
  channelId: string,
  types?: MemoryType[]
): Promise<ChannelMemory[]> {
  const memories = await prisma.youtubeMemory.findMany({
    where: {
      channelId,
      ...(types ? { type: { in: types } } : {}),
    },
    orderBy: [
      { confidence: "desc" },
      { usageCount: "desc" },
    ],
    take: 30,
  });

  return memories.map(m => ({
    type: m.type as MemoryType,
    key: m.key,
    value: m.value,
    confidence: m.confidence,
    usageCount: m.usageCount,
    successRate: m.successRate ?? undefined,
  }));
}

export async function storeProjectLearnings(
  channelId: string,
  projectId: string,
  script: GeneratedScript,
  seo: SeoPackage,
  quality: QualityReport
): Promise<void> {
  const learnings = await extractLearnings(script, seo, quality);

  for (const learning of learnings) {
    const existing = await prisma.youtubeMemory.findFirst({
      where: { channelId, type: learning.type, key: learning.key },
    });

    if (existing) {
      const newConfidence = Math.min(1, existing.confidence + 0.05);
      await prisma.youtubeMemory.update({
        where: { id: existing.id },
        data: {
          value: learning.value,
          confidence: newConfidence,
          usageCount: { increment: 1 },
        },
      });
    } else {
      await prisma.youtubeMemory.create({
        data: {
          channelId,
          type: learning.type,
          key: learning.key,
          value: learning.value,
          confidence: learning.confidence,
          usageCount: 1,
        },
      });
    }
  }
}

async function extractLearnings(
  script: GeneratedScript,
  seo: SeoPackage,
  quality: QualityReport
): Promise<ChannelMemory[]> {
  const prompt = `Extract reusable learnings from this video production for future use.

Script hook: "${script.hook}"
Hook type: ${script.hookType}
Emotion score: ${script.emotionScore}
Retention score: ${script.retentionScore}
Quality overall: ${quality.overallScore}
SEO title: "${seo.title}"
CTR prediction: ${seo.ctrPrediction}%
Thumbnail concept: "${seo.thumbnailConcept}"

Extract 5-8 specific, reusable learnings. Return JSON:
{
  "learnings": [
    {
      "type": "HOOK|STYLE|METAPHOR|THUMBNAIL|PACING|SEO|VISUAL",
      "key": "short descriptive key",
      "value": "the specific learning — what worked and why",
      "confidence": 0.7
    }
  ]
}`;

  const result = await ytLLMJson<{ learnings: ChannelMemory[] }>(prompt, YT_MODELS.QUALITY);
  return result.learnings;
}

export async function getMemoriesForContext(channelId: string): Promise<string> {
  const memories = await retrieveChannelMemories(channelId);
  if (memories.length === 0) return "No channel memories yet — this is the first video.";

  const top = memories.slice(0, 10);
  return top.map(m => `[${m.type}] ${m.key}: ${m.value} (confidence: ${Math.round(m.confidence * 100)}%)`).join("\n");
}
