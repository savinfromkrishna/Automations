import { prisma } from "../../prisma";
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
  const learnings = extractLearnings(script, seo, quality);

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

// Heuristic learning extraction — no LLM call needed. The inputs are already
// structured data; we just summarize what worked for future projects.
function extractLearnings(
  script: GeneratedScript,
  seo: SeoPackage,
  quality: QualityReport
): ChannelMemory[] {
  const out: ChannelMemory[] = [];
  const confidenceFromScore = (s: number) => Math.max(0.4, Math.min(0.95, s / 100));

  // HOOK learning — only worth storing if the hook actually scored well
  if (script.emotionScore >= 75) {
    out.push({
      type: "HOOK",
      key: `${script.hookType}_emotion_${Math.round(script.emotionScore)}`,
      value: `Hook type "${script.hookType}" with emotion ${script.emotionScore}/100: "${script.hook.slice(0, 200)}"`,
      confidence: confidenceFromScore(script.emotionScore),
      usageCount: 0,
    });
  }

  // PACING — section structure that produced good retention
  if (script.retentionScore >= 75 && script.sections.length > 0) {
    out.push({
      type: "PACING",
      key: `sections_${script.sections.length}_retention_${Math.round(script.retentionScore)}`,
      value: `${script.sections.length} sections, ${Math.round(script.estimatedDuration / 60)}min, retention ${script.retentionScore}/100. Tension points: ${script.tensionPoints.length}.`,
      confidence: confidenceFromScore(script.retentionScore),
      usageCount: 0,
    });
  }

  // SEO — successful title pattern
  if (quality.seoStrength >= 70) {
    out.push({
      type: "SEO",
      key: `title_${seo.title.length}chars_ctr_${Math.round(seo.ctrPrediction ?? 5)}`,
      value: `Title "${seo.title}" (${seo.title.length} chars) predicted CTR ${seo.ctrPrediction}%. Primary: ${seo.primaryKeyword}.`,
      confidence: confidenceFromScore(quality.seoStrength),
      usageCount: 0,
    });
  }

  // THUMBNAIL — if quality was approved, the concept is worth remembering
  if (quality.approved && seo.thumbnailConcept) {
    out.push({
      type: "THUMBNAIL",
      key: `${seo.thumbnailEmotion}_emotion`,
      value: `${seo.thumbnailEmotion} thumbnails: ${seo.thumbnailConcept.slice(0, 240)}`,
      confidence: confidenceFromScore(quality.overallScore),
      usageCount: 0,
    });
  }

  // STYLE — overall style fingerprint when the video scored well
  if (quality.overallScore >= 80) {
    out.push({
      type: "STYLE",
      key: `overall_${Math.round(quality.overallScore)}`,
      value: `Approved style: emotion ${script.emotionScore}, retention ${script.retentionScore}, originality ${script.originalityScore}, SEO ${quality.seoStrength}.`,
      confidence: confidenceFromScore(quality.overallScore),
      usageCount: 0,
    });
  }

  // VISUAL — only if visual coherence was strong
  if (quality.visualCoherence >= 80) {
    out.push({
      type: "VISUAL",
      key: `coherence_${Math.round(quality.visualCoherence)}`,
      value: `Visual coherence ${quality.visualCoherence}/100 — pattern worked well.`,
      confidence: confidenceFromScore(quality.visualCoherence),
      usageCount: 0,
    });
  }

  return out;
}

export async function getMemoriesForContext(channelId: string): Promise<string> {
  const memories = await retrieveChannelMemories(channelId);
  if (memories.length === 0) return "No channel memories yet — this is the first video.";

  const top = memories.slice(0, 10);
  return top.map(m => `[${m.type}] ${m.key}: ${m.value} (confidence: ${Math.round(m.confidence * 100)}%)`).join("\n");
}
