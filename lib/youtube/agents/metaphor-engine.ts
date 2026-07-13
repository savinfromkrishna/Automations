import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import type { MetaphorMap, InsightSet, PipelineContext } from "../types";

const SYMBOLIC_DATABASE: Record<string, string> = {
  discipline: "rusted sword slowly being reforged",
  anxiety: "hallway that gets narrower with each step",
  ego: "broken mirror that still shows a perfect reflection",
  purpose: "distant lighthouse in a storm",
  depression: "room where all the light switches stopped working",
  growth: "roots breaking through concrete",
  fear: "door you keep walking past but never open",
  identity: "mask collection on a wall",
};

export async function runMetaphorEngineAgent(
  ctx: PipelineContext,
  concept: string,
  insights: InsightSet,
  metaphorSeed?: string
): Promise<MetaphorMap> {
  const seedContext = metaphorSeed
    ? `Seed metaphor: "${metaphorSeed}"`
    : `Examples: ${Object.entries(SYMBOLIC_DATABASE).slice(0, 5).map(([k, v]) => `${k}→${v}`).join("; ")}`;

  const prompt = `Build a visual-symbolic language for "${concept}".
Core insight: "${insights.coreInsight}"
Emotional truth: "${insights.emotionalTruth}"
Symbolism: "${insights.symbolism}"
${seedContext}

Transform abstract ideas into concrete cinematic symbols. Use environments as emotional mirrors.

Return JSON:
{
  "centralMetaphor": "1-2 vivid sentences",
  "visualSymbol": "primary object/image",
  "emotionalEnvironment": "cinematic setting",
  "recurringElements": [
    {"concept": "", "symbol": "", "visualRepresentation": "specific cinematic description", "emotionalMeaning": ""},
    {"concept": "", "symbol": "", "visualRepresentation": "", "emotionalMeaning": ""},
    {"concept": "", "symbol": "", "visualRepresentation": "", "emotionalMeaning": ""}
  ],
  "colorPsychology": "palette + meaning",
  "lightingMood": "lighting style + why",
  "soundscapeTheme": "sonic world",
  "narrativeArchetype": "Hero's Journey | Fall from Grace | Descent and Return | etc"
}`;

  return ytLLMJson<MetaphorMap>(prompt, YT_MODELS.SCRIPT, {
    maxTokens: YT_TOKEN_BUDGET.METAPHOR,
    temperature: 0.85,
  });
}
