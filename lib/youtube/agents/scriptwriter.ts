import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import type {
  GeneratedScript, NicheBlueprint, InsightSet, MetaphorMap, PipelineContext
} from "../types";

export async function runScriptwriterAgent(
  ctx: PipelineContext,
  concept: string,
  insights: InsightSet,
  metaphors: MetaphorMap,
  nicheBlueprint: NicheBlueprint
): Promise<GeneratedScript> {
  const durationWords = Math.round(ctx.preferredDuration * 60 * 2.5); // ~150 wpm

  const prompt = `You are a cinematic YouTube screenwriter. Write a script that stops scrolls and creates emotional impact.

CONCEPT: "${concept}"
DURATION: ${ctx.preferredDuration}min (~${durationWords} words)
Style: ${ctx.style} | Tone: ${ctx.tone} | Audience: ${ctx.targetAudience || nicheBlueprint.psychologicalProfile.slice(0, 120)}

Core insight: ${insights.coreInsight}
Emotional truth: ${insights.emotionalTruth}
Central metaphor: ${metaphors.centralMetaphor}
Visual world: ${metaphors.emotionalEnvironment}
Archetype: ${metaphors.narrativeArchetype}
Triggers: ${nicheBlueprint.emotionalTriggers.slice(0, 3).join(", ")}
Pacing: ${nicheBlueprint.pacingPreferences}

STRUCTURE: Hook(0-15s) → Escalation → Emotional Descent(~50%) → Philosophical Turn → Transformation → Payoff(90-100%)
RULES: no generic motivation, short punchy sentences for impact + longer ones for depth, concrete imagery, write for the ear, use "you", use "..." for pauses.

Return JSON:
{
  "hook": "exact 3-15s opening",
  "hookType": "question|statement|shocking|visual|silence",
  "fullScript": "full ~${durationWords}-word narration",
  "sections": [{"sectionId":"s1","type":"HOOK","title":"","narration":"exact words","emotionalBeat":"","duration":15,"startTime":0,"visualNote":"","tensionLevel":3}],
  "wordCount": ${durationWords},
  "estimatedDuration": ${ctx.preferredDuration * 60},
  "emotionalArc": [{"timePercent":0,"emotion":"","intensity":6},{"timePercent":50,"emotion":"","intensity":9},{"timePercent":100,"emotion":"","intensity":10}],
  "tensionPoints": [{"timePercent":20,"description":"","type":"buildup"},{"timePercent":55,"description":"","type":"twist"},{"timePercent":80,"description":"","type":"revelation"}],
  "retentionScore": 82, "emotionScore": 88, "originalityScore": 79
}
Include 6-10 sections covering the full arc.`;

  // Budget = ~1.4x the narration word count (≈ tokens) + overhead for arc/sections JSON.
  // 8min video ≈ 1200 words ≈ 1600 tokens narration + 400 overhead = 2000 tokens.
  const dynamicBudget = Math.round(durationWords * 1.4) + YT_TOKEN_BUDGET.SCRIPT_BASE;

  return ytLLMJson<GeneratedScript>(prompt, YT_MODELS.SCRIPT, {
    maxTokens: Math.min(8000, Math.max(1500, dynamicBudget)),
    temperature: 0.85,
  });
}
