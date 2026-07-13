import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
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
  const prompt = `Trend Intelligence for niche "${ctx.niche}"${ctx.subNiche ? ` / ${ctx.subNiche}` : ""}.
Style: ${ctx.style} | Tone: ${ctx.tone} | Audience: ${ctx.targetAudience || ctx.niche}

Identify 5 rising, non-saturated viral video opportunities suited for cinematic metaphor storytelling. Score each idea on trendScore, viralityScore, competitionScore (lower=better), opportunityScore. metaphorSeed = short symbolic visual concept (e.g. "rusted sword", "distant lighthouse").

Return JSON:
{
  "ideas": [{"title": "", "concept": "2-3 sentences", "hook": "first 3s line", "emotionalAngle": "", "targetEmotion": "curiosity|awe|nostalgia|fear|inspiration|grief|anger|hope", "metaphorSeed": "", "trendScore": 0, "viralityScore": 0, "competitionScore": 0, "opportunityScore": 0, "keywords": ["",""], "sourceSignals": ""}],
  "marketInsights": "",
  "emergingNarratives": ["",""],
  "saturatedTopics": ["",""]
}
Exactly 5 ideas. Emotionally powerful, unique.`;

  return ytLLMJson<TrendIntelligenceOutput>(prompt, YT_MODELS.TREND, {
    maxTokens: YT_TOKEN_BUDGET.TREND,
    temperature: 0.85,
  });
}
