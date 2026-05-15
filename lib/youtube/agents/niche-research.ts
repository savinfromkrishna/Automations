import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { NicheBlueprint, PipelineContext } from "../types";

export async function runNicheResearchAgent(
  ctx: PipelineContext,
  concept: string
): Promise<NicheBlueprint> {
  const prompt = `You are the Head of Audience Psychology at an elite YouTube media company.

Conduct a deep psychological analysis of the "${ctx.niche}" YouTube audience for this video concept:
"${concept}"

RESEARCH DIMENSIONS:
1. Who exactly watches this content? Their life situation, fears, dreams, frustrations
2. What unconscious desires drive their viewing behavior?
3. What emotional triggers create maximum retention and shares?
4. What storytelling structures have proven most successful?
5. What visual language resonates with this audience?
6. What pacing keeps them locked in?
7. What hooks make them click immediately?

Channel style: ${ctx.style} | Tone: ${ctx.tone}

Return a JSON object:
{
  "psychologicalProfile": "detailed description of the core audience member — their inner world, daily life, aspirations",
  "coreDesires": ["deep desire 1", "deep desire 2", "deep desire 3", "deep desire 4"],
  "painPoints": ["specific pain point 1", "pain point 2", "pain point 3"],
  "emotionalTriggers": ["trigger that creates strong emotional response 1", "trigger 2", "trigger 3", "trigger 4"],
  "successfulPatterns": ["storytelling pattern that works extremely well", "pattern 2", "pattern 3"],
  "visualLanguage": "description of visual aesthetics, color palettes, imagery that resonates",
  "pacingPreferences": "how fast/slow, how many cuts, what rhythm works for this audience",
  "hookStyles": ["hook style that works best 1", "hook style 2", "hook style 3"],
  "audienceJourney": "the emotional journey from clicking to finishing — what transforms them"
}`;

  return ytLLMJson<NicheBlueprint>(prompt, YT_MODELS.RESEARCH);
}
