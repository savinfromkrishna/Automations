import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { MetaphorMap, MetaphorElement, InsightSet, PipelineContext } from "../types";

// Built-in symbolic database for grounding the LLM
const SYMBOLIC_DATABASE: Record<string, string> = {
  discipline: "rusted sword slowly being reforged",
  anxiety: "hallway that gets narrower with each step",
  ego: "broken mirror that still tries to show a perfect reflection",
  purpose: "distant lighthouse in a storm",
  depression: "room where all the light switches stopped working",
  growth: "roots breaking through concrete",
  fear: "door you keep walking past but never open",
  identity: "mask collection on a wall",
  success: "summit in permanent cloud cover",
  failure: "unfinished building you keep adding to",
  time: "river flowing through your hands",
  memory: "polaroid photos fading in sunlight",
  change: "tide reshaping the shore",
  loneliness: "crowded room where everyone speaks a different language",
  hope: "single candle in a vast dark room",
};

export async function runMetaphorEngineAgent(
  ctx: PipelineContext,
  concept: string,
  insights: InsightSet,
  metaphorSeed?: string
): Promise<MetaphorMap> {
  const seedContext = metaphorSeed
    ? `The seed metaphor to build from: "${metaphorSeed}"`
    : `Suggested symbolic references: ${Object.entries(SYMBOLIC_DATABASE).slice(0, 8).map(([k, v]) => `${k} → ${v}`).join("; ")}`;

  const prompt = `You are the Metaphor Architect at a cinematic storytelling studio. You transform abstract concepts into visceral visual experiences.

CONCEPT: "${concept}"
CORE INSIGHT: "${insights.coreInsight}"
EMOTIONAL TRUTH: "${insights.emotionalTruth}"
SYMBOLISM: "${insights.symbolism}"
${seedContext}

Your mission: Create a complete visual-symbolic language for this video. Every element should be emotionally loaded, visually striking, and cinematically achievable.

METAPHOR PRINCIPLES:
- Transform abstract ideas into concrete, visible symbols
- Use environments as emotional mirrors
- Create recurring visual motifs that build meaning
- Choose imagery that triggers unconscious recognition
- Make the metaphor feel inevitable — like it was always the right choice

Return a JSON object:
{
  "centralMetaphor": "the main symbolic concept that carries the entire video (1-2 sentences describing it vividly)",
  "visualSymbol": "the primary visual object/image that represents the core concept",
  "emotionalEnvironment": "the setting/world that embodies the emotional state — describe it cinematically",
  "recurringElements": [
    {
      "concept": "abstract idea being symbolized",
      "symbol": "the visual symbol used",
      "visualRepresentation": "how this looks on screen — specific cinematic description",
      "emotionalMeaning": "why this symbol creates this specific feeling"
    },
    {
      "concept": "second abstract idea",
      "symbol": "its visual symbol",
      "visualRepresentation": "cinematic description",
      "emotionalMeaning": "emotional resonance"
    },
    {
      "concept": "third abstract idea",
      "symbol": "its visual symbol",
      "visualRepresentation": "cinematic description",
      "emotionalMeaning": "emotional resonance"
    }
  ],
  "colorPsychology": "the color palette and what each color communicates emotionally",
  "lightingMood": "the lighting style — golden hour, cold blue shadows, single candle, industrial fluorescent — and why",
  "soundscapeTheme": "the sonic world — what ambient sounds, what musical mood, what silence communicates",
  "narrativeArchetype": "the story archetype this follows — Hero's Journey, Fall from Grace, Descent and Return, etc."
}`;

  return ytLLMJson<MetaphorMap>(prompt, YT_MODELS.SCRIPT);
}
