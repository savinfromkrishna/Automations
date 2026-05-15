import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { SeoPackage, GeneratedScript, PipelineContext } from "../types";

export async function runSeoGeneratorAgent(
  ctx: PipelineContext,
  concept: string,
  script: GeneratedScript,
  trendKeywords: string[]
): Promise<SeoPackage> {
  const prompt = `You are the YouTube SEO Director at a top-tier content agency. Create a complete SEO package that maximizes discoverability and click-through rate.

CONCEPT: "${concept}"
NICHE: ${ctx.niche}
VIDEO DURATION: ${Math.round(script.estimatedDuration / 60)} minutes
HOOK: "${script.hook}"
EMOTION LEVEL: ${script.emotionScore}/100
TREND KEYWORDS: ${trendKeywords.join(", ")}

SCRIPT EXCERPT (for keyword extraction):
${script.fullScript.substring(0, 500)}...

SEO STRATEGY:
1. Title: Emotionally compelling, 50-60 characters, includes primary keyword naturally
2. Description: 300+ words, hooks in first 2 lines, includes keywords naturally, strong CTA
3. Tags: 15-20 tags mixing broad and specific, include emotional/psychological terms
4. Chapters: Timestamp markers for retention, every 1-3 minutes
5. Thumbnail: Psychological trigger concept

YouTube Algorithm Optimization:
- High CTR triggers: curiosity gaps, emotional words, numbers, "you" perspective
- Retention signals: chapter structure, pattern interrupts, emotional peaks
- Engagement signals: questions, calls to action at natural pause points

Return JSON:
{
  "title": "optimized title 50-60 chars",
  "description": "full 300+ word description with hooks, keywords, chapters preview, CTA",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12", "tag13", "tag14", "tag15"],
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "chapters": [
    {"timestamp": "0:00", "title": "Opening chapter title"},
    {"timestamp": "1:30", "title": "Second chapter"}
  ],
  "primaryKeyword": "the main target keyword",
  "keywordClusters": [["primary", "variations", "long-tail"], ["secondary cluster", "related terms"]],
  "ctrPrediction": 6.5,
  "searchVolume": "HIGH|MEDIUM|LOW",
  "thumbnailConcept": "detailed description of what the thumbnail should look like — composition, subject, text overlay position, visual hook",
  "thumbnailText": "3-5 word overlay text that creates curiosity",
  "thumbnailEmotion": "primary emotion the thumbnail should trigger: shock|curiosity|awe|fear|hope"
}`;

  return ytLLMJson<SeoPackage>(prompt, YT_MODELS.SEO);
}
