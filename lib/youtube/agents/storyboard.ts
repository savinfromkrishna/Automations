import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { GeneratedStoryboard, StoryboardScene, GeneratedScript, MetaphorMap, PipelineContext } from "../types";

export async function runStoryboardAgent(
  ctx: PipelineContext,
  script: GeneratedScript,
  metaphors: MetaphorMap
): Promise<GeneratedStoryboard> {
  const scenesTarget = Math.max(8, Math.min(20, Math.round(script.estimatedDuration / 30)));

  const sectionsJson = JSON.stringify(script.sections.map(s => ({
    id: s.sectionId,
    type: s.type,
    narration: s.narration.substring(0, 200),
    duration: s.duration,
    startTime: s.startTime,
    emotionalBeat: s.emotionalBeat,
    visualNote: s.visualNote,
  })));

  const prompt = `You are the Cinematography Director and Storyboard Supervisor at a cinematic YouTube production studio.

Transform this script into a complete visual production plan. Every scene must be cinematically rich, emotionally precise, and practically achievable with AI image/video generation.

VISUAL WORLD:
- Central Metaphor: ${metaphors.centralMetaphor}
- Environment: ${metaphors.emotionalEnvironment}
- Color Psychology: ${metaphors.colorPsychology}
- Lighting Mood: ${metaphors.lightingMood}
- Visual Style: ${ctx.visualStyle || "cinematic, highly stylized, 4K"}
- Narrative Archetype: ${metaphors.narrativeArchetype}

RECURRING VISUAL ELEMENTS:
${metaphors.recurringElements.map(e => `- ${e.symbol}: ${e.visualRepresentation}`).join("\n")}

SCRIPT SECTIONS TO VISUALIZE:
${sectionsJson}

SCENE CREATION RULES:
- Each scene should be 20-45 seconds
- Write visual prompts as if directing an AI artist — be hyper-specific
- Include exact camera movements (slow push-in, wide establishing, extreme close-up, etc.)
- Every environment should feel emotionally loaded
- Use lighting to carry emotion (golden-hour warmth, cold blue shadows, single-source candle, etc.)
- Include the metaphor elements naturally
- Create seamless emotional flow between scenes

Target: ${scenesTarget} scenes covering the full ${Math.round(script.estimatedDuration / 60)} minute video.

Return this JSON:
{
  "totalScenes": ${scenesTarget},
  "totalDuration": ${script.estimatedDuration},
  "visualStyle": "one-sentence description of the overall visual aesthetic",
  "colorGrading": "specific color grade description (e.g., 'desaturated blues with warm amber highlights')",
  "motionStyle": "description of camera movement philosophy",
  "transitionStyle": "primary transition style between scenes",
  "paceNotes": "overall pacing guidance for the editor",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "HOOK",
      "scriptText": "exact narration words for this scene",
      "visualPrompt": "ultra-detailed AI image generation prompt — describe the exact image: subject, environment, lighting, mood, style, camera angle, depth of field, color grade — minimum 50 words",
      "duration": 15,
      "startTime": 0,
      "cameraDirection": "specific camera movement and angle",
      "lightingNotes": "precise lighting setup description",
      "transition": "transition type to next scene",
      "environment": "the location/world of this scene",
      "metaphorElement": "which symbolic element appears here",
      "emotionalBeat": "what the viewer feels"
    }
  ]
}`;

  return ytLLMJson<GeneratedStoryboard>(prompt, YT_MODELS.SCRIPT);
}
