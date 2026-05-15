import { ytLLMJson, YT_MODELS } from "../synthesize";
import type {
  GeneratedScript, ScriptSection, EmotionalArcPoint, TensionPoint,
  NicheBlueprint, InsightSet, MetaphorMap, PipelineContext
} from "../types";

export async function runScriptwriterAgent(
  ctx: PipelineContext,
  concept: string,
  insights: InsightSet,
  metaphors: MetaphorMap,
  nicheBlueprint: NicheBlueprint
): Promise<GeneratedScript> {
  const durationWords = Math.round(ctx.preferredDuration * 60 * 2.5); // ~150 wpm narration pace

  const prompt = `You are the Chief Screenwriter at a cinematic YouTube storytelling studio. You write scripts that make people stop scrolling, lean forward, and feel something real.

VIDEO CONCEPT: "${concept}"
DURATION TARGET: ${ctx.preferredDuration} minutes (~${durationWords} words of narration)
STYLE: ${ctx.style} | TONE: ${ctx.tone}
AUDIENCE: ${ctx.targetAudience || nicheBlueprint.psychologicalProfile}

CORE INSIGHT TO COMMUNICATE:
${insights.coreInsight}

EMOTIONAL TRUTH: ${insights.emotionalTruth}
CENTRAL METAPHOR: ${metaphors.centralMetaphor}
VISUAL WORLD: ${metaphors.emotionalEnvironment}
STORY ARCHETYPE: ${metaphors.narrativeArchetype}

AUDIENCE PSYCHOLOGY:
- Core desires: ${nicheBlueprint.coreDesires.join(", ")}
- Emotional triggers: ${nicheBlueprint.emotionalTriggers.join(", ")}
- Pacing preference: ${nicheBlueprint.pacingPreferences}

SCRIPT STRUCTURE REQUIREMENTS:
1. HOOK (0-15s): Immediately creates pattern interruption or emotional pull
2. ESCALATION (15s-2min): Builds tension, introduces the central conflict
3. EMOTIONAL DESCENT (2min-50%): Takes the viewer into the uncomfortable truth
4. PHILOSOPHICAL TURN (50%-70%): The insight that reframes everything
5. TRANSFORMATION (70%-90%): The emotional shift, the revelation
6. PAYOFF (90%-100%): The resolution that makes the journey worth it

WRITING RULES:
- Never use generic motivational phrases
- Use short, punchy sentences for impact
- Use longer sentences for emotional depth
- Include specific, concrete imagery
- Write FOR the ear, not the eye
- Create deliberate pauses with ellipses "..."
- Use "you" to speak directly to the viewer
- Every sentence must earn its place

Return this JSON structure:
{
  "hook": "the exact opening line(s) that run for first 3-15 seconds",
  "hookType": "question|statement|shocking|visual|silence",
  "fullScript": "the complete narration text, approximately ${durationWords} words",
  "sections": [
    {
      "sectionId": "s1",
      "type": "HOOK",
      "title": "section name",
      "narration": "the exact words spoken in this section",
      "emotionalBeat": "what the viewer feels here",
      "duration": 15,
      "startTime": 0,
      "visualNote": "what should be visually happening during this narration",
      "tensionLevel": 3
    }
  ],
  "wordCount": ${Math.round(durationWords)},
  "estimatedDuration": ${ctx.preferredDuration * 60},
  "emotionalArc": [
    {"timePercent": 0, "emotion": "curiosity", "intensity": 6},
    {"timePercent": 25, "emotion": "unease", "intensity": 7},
    {"timePercent": 50, "emotion": "realization", "intensity": 9},
    {"timePercent": 75, "emotion": "awe", "intensity": 8},
    {"timePercent": 100, "emotion": "transformation", "intensity": 10}
  ],
  "tensionPoints": [
    {"timePercent": 20, "description": "what creates tension here", "type": "buildup"},
    {"timePercent": 55, "description": "the central twist or revelation", "type": "twist"},
    {"timePercent": 80, "description": "the emotional climax", "type": "revelation"}
  ],
  "retentionScore": 82,
  "emotionScore": 88,
  "originalityScore": 79
}

Include 6-10 sections covering the full arc. Make this the best script this channel has ever produced.`;

  return ytLLMJson<GeneratedScript>(prompt, YT_MODELS.SCRIPT);
}
