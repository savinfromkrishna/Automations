import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { InsightSet, NicheBlueprint, PipelineContext } from "../types";

export async function runInsightGeneratorAgent(
  ctx: PipelineContext,
  concept: string,
  nicheBlueprint: NicheBlueprint
): Promise<InsightSet> {
  const prompt = `You are the Chief Insight Architect at a cinematic storytelling studio. Your job is to find the ORIGINAL, NON-GENERIC insight that makes a video unforgettable.

CONCEPT: "${concept}"
NICHE: ${ctx.niche}
AUDIENCE CORE DESIRES: ${nicheBlueprint.coreDesires.join(", ")}
AUDIENCE PAIN POINTS: ${nicheBlueprint.painPoints.join(", ")}

Your mission: Go beneath the surface of this concept and find the philosophical truth, the psychological paradox, the hidden contradiction that most creators miss.

AVOID:
- Generic motivational insights ("just believe in yourself")
- Surface-level observations
- Advice-style content
- Anything that sounds like it was written by AI

INSTEAD, find:
- The uncomfortable truth hidden inside the concept
- The psychological paradox most people don't acknowledge
- The philosophical depth that makes people feel understood
- The symbolic meaning that resonates at an unconscious level
- The contradiction that reveals a deeper truth

Return a JSON object:
{
  "coreInsight": "the central, original insight — 2-3 sentences that feel like a revelation",
  "philosophicalLayer": "the deeper philosophical truth this concept connects to",
  "psychologicalAngle": "the psychological mechanism at play that most people don't notice",
  "contradictions": ["apparent contradiction that reveals truth 1", "contradiction 2", "contradiction 3"],
  "symbolism": "the symbolic meaning embedded in this concept",
  "emotionalTruth": "what this concept makes people feel at their core — and why",
  "uniquePerspectives": ["angle no one else is exploring 1", "unique angle 2", "unique angle 3"],
  "narrativeHook": "the single most compelling way to frame this concept for the audience"
}`;

  return ytLLMJson<InsightSet>(prompt, YT_MODELS.SCRIPT);
}
