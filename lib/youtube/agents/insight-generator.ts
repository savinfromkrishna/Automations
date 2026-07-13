import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import type { InsightSet, NicheBlueprint, PipelineContext } from "../types";

export async function runInsightGeneratorAgent(
  ctx: PipelineContext,
  concept: string,
  nicheBlueprint: NicheBlueprint
): Promise<InsightSet> {
  const prompt = `Find the original, non-generic insight that makes "${concept}" unforgettable.
Niche: ${ctx.niche}
Desires: ${nicheBlueprint.coreDesires.slice(0, 4).join(", ")}
Pains: ${nicheBlueprint.painPoints.slice(0, 3).join(", ")}

Avoid: generic motivation, surface observations, advice-style, AI clichés.
Find: uncomfortable truths, psychological paradoxes, philosophical depth, symbolic meaning.

Return JSON:
{
  "coreInsight": "2-3 sentences that feel like a revelation",
  "philosophicalLayer": "deeper truth",
  "psychologicalAngle": "hidden mechanism",
  "contradictions": ["",""],
  "symbolism": "embedded symbolic meaning",
  "emotionalTruth": "what it makes people feel and why",
  "uniquePerspectives": ["",""],
  "narrativeHook": "most compelling framing"
}`;

  return ytLLMJson<InsightSet>(prompt, YT_MODELS.SCRIPT, {
    maxTokens: YT_TOKEN_BUDGET.INSIGHT,
    temperature: 0.8,
  });
}
