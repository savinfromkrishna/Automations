import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import type { GeneratedStoryboard, GeneratedScript, MetaphorMap, PipelineContext } from "../types";

export async function runStoryboardAgent(
  ctx: PipelineContext,
  script: GeneratedScript,
  metaphors: MetaphorMap
): Promise<GeneratedStoryboard> {
  const scenesTarget = Math.max(8, Math.min(20, Math.round(script.estimatedDuration / 30)));

  // Compress sections: just narration first sentence + duration + emotion
  // (full narration isn't needed — storyboard only needs gist + timing)
  const sectionsCompact = script.sections.map(s => ({
    t: s.type,
    n: s.narration.substring(0, 120),
    d: s.duration,
    s: s.startTime,
    e: s.emotionalBeat,
  }));

  const recurringStr = metaphors.recurringElements.slice(0, 4)
    .map(e => `${e.symbol}: ${e.visualRepresentation}`).join(" | ");

  const prompt = `Cinematography Director. Convert script into ${scenesTarget} cinematic scenes for AI image generation.

Visual world:
- Central metaphor: ${metaphors.centralMetaphor}
- Environment: ${metaphors.emotionalEnvironment}
- Color: ${metaphors.colorPsychology}
- Lighting: ${metaphors.lightingMood}
- Style: ${ctx.visualStyle || "cinematic 4K"}
- Recurring: ${recurringStr}

Script sections (compact):
${JSON.stringify(sectionsCompact)}

Rules: 20-45s/scene, hyper-specific visual prompts, exact camera moves, emotion-loaded environments, integrated metaphors.

Return JSON:
{
  "totalScenes": ${scenesTarget},
  "totalDuration": ${script.estimatedDuration},
  "visualStyle": "one-sentence aesthetic",
  "colorGrading": "specific grade",
  "motionStyle": "camera philosophy",
  "transitionStyle": "primary transition",
  "paceNotes": "editor guidance",
  "scenes": [{"sceneNumber":1,"type":"HOOK","scriptText":"exact narration","visualPrompt":"50+ word ultra-detailed prompt: subject, environment, lighting, mood, style, angle, DOF, color grade","duration":15,"startTime":0,"cameraDirection":"","lightingNotes":"","transition":"","environment":"","metaphorElement":"","emotionalBeat":""}]
}`;

  return ytLLMJson<GeneratedStoryboard>(prompt, YT_MODELS.SCRIPT, {
    maxTokens: YT_TOKEN_BUDGET.STORYBOARD,
    temperature: 0.8,
  });
}
