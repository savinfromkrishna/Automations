import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { TrendIdea, PipelineContext } from "../types";

interface TrendIntelligenceOutput {
  ideas: TrendIdea[];
  marketInsights: string;
  emergingNarratives: string[];
  saturatedTopics: string[];
}

export async function runTrendIntelligenceAgent(
  ctx: PipelineContext
): Promise<TrendIntelligenceOutput> {
  const prompt = `You are the Trend Intelligence Director of a world-class AI YouTube media company.

Your mission: analyze the content landscape for the niche "${ctx.niche}"${ctx.subNiche ? ` (sub-niche: ${ctx.subNiche})` : ""} and identify the TOP 5 viral video opportunities right now.

Channel style: ${ctx.style} | Tone: ${ctx.tone}
Target audience: ${ctx.targetAudience || "general audience interested in " + ctx.niche}

ANALYSIS FRAMEWORK:
1. Identify rising topics in ${ctx.niche} that haven't been saturated yet
2. Find emotional narratives that resonate deeply with the audience
3. Detect content gaps — what's missing that the audience craves
4. Identify high-retention storytelling angles
5. Find concepts that work well with cinematic metaphor-based storytelling

For each idea, score:
- trendScore (0-100): How trending is this topic RIGHT NOW
- viralityScore (0-100): How likely it is to go viral based on emotional hooks
- competitionScore (0-100): Competition level (LOWER = better opportunity)
- opportunityScore (0-100): Overall opportunity score (higher = better)

The metaphorSeed should be a symbolic visual concept (e.g., "rusted sword", "collapsing mirror", "distant lighthouse")

Return a JSON object with this exact structure:
{
  "ideas": [
    {
      "title": "catchy video title",
      "concept": "2-3 sentence description of what this video explores",
      "hook": "opening hook sentence that grabs attention in first 3 seconds",
      "emotionalAngle": "the primary emotional journey for the viewer",
      "targetEmotion": "primary emotion: curiosity|awe|nostalgia|fear|inspiration|grief|anger|hope",
      "metaphorSeed": "visual metaphor symbol for this concept",
      "trendScore": 85,
      "viralityScore": 78,
      "competitionScore": 30,
      "opportunityScore": 88,
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "sourceSignals": "what signals indicate this is trending (community discussions, search behavior, etc)"
    }
  ],
  "marketInsights": "overall analysis of the current content market for this niche",
  "emergingNarratives": ["narrative theme 1", "narrative theme 2", "narrative theme 3"],
  "saturatedTopics": ["oversaturated topic 1", "oversaturated topic 2"]
}

Generate exactly 5 ideas. Make them emotionally powerful, unique, and perfect for cinematic storytelling.`;

  return ytLLMJson<TrendIntelligenceOutput>(prompt, YT_MODELS.TREND);
}
