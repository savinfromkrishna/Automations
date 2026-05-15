import { generateTts } from "../../media";
import { prisma } from "../../prisma";
import { ytLLMJson, YT_MODELS } from "../synthesize";
import { TokenAllocator } from "../token-allocator";
import type { GeneratedScript } from "../types";

// Try multiple TTS models in order — first one that works wins.
const TTS_MODELS = [
  "facebook/mms-tts-eng",
  "microsoft/speecht5_tts",
  "espnet/kan-bayashi_ljspeech_vits",
];

export interface AudioGenerationResult {
  narrationUrl?: string;
  narrationChars: number;
  musicPrompt: string;
  sfxSuggestions: string[];
  atmosphericNotes: string;
  ttsModel?: string;
  ttsProvider?: string;
  tokenUsed?: string;
  exhaustedKeys?: string[];
  error?: string;
}

interface MusicBrief {
  musicPrompt: string;
  sfxSuggestions: string[];
  atmosphericNotes: string;
  paceDescription: string;
  instrumentationNotes: string;
}

export async function runAudioAgent(
  projectId: string,
  script: GeneratedScript,
  emotionalArcDescription: string
): Promise<AudioGenerationResult> {
  // Music brief uses LLM (cheap, fast)
  const musicBrief = await generateMusicBrief(script, emotionalArcDescription);

  let narrationUrl: string | undefined;
  let narrationChars = 0;
  let ttsModel: string | undefined;
  let ttsProvider: string | undefined;
  let tokenUsed: string | undefined;
  let exhaustedKeys: string[] = [];
  let ttsError: string | undefined;

  const narrationText = script.fullScript.substring(0, 3000);
  narrationChars = narrationText.length;

  // Try each TTS model, with a fresh token from the pool for each attempt.
  const allocator = await TokenAllocator.create();
  const errors: string[] = [];

  for (let i = 0; i < TTS_MODELS.length; i++) {
    const model = TTS_MODELS[i];
    const preferredToken = allocator.at(i);

    try {
      const ttsResult = await generateTts(narrationText, model, { hfToken: preferredToken });

      narrationUrl = ttsResult.url;
      ttsModel = ttsResult.model;
      ttsProvider = ttsResult.provider;
      tokenUsed = ttsResult.tokenUsed;
      exhaustedKeys = ttsResult.exhaustedKeys ?? [];

      await prisma.youtubeAsset.create({
        data: {
          projectId,
          type: "AUDIO_NARRATION",
          url: ttsResult.url,
          prompt: "narration for video",
          provider: ttsResult.provider,
          model: ttsResult.model,
          duration: script.estimatedDuration,
          metadata: JSON.stringify({
            tokenUsed: ttsResult.tokenUsed,
            exhaustedKeys: ttsResult.exhaustedKeys,
            chars: ttsResult.chars,
          }),
        },
      });
      break; // success — stop trying models
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      errors.push(`${model}: ${msg.substring(0, 200)}`);
      console.warn(`[AudioAgent] TTS model ${model} failed:`, msg.substring(0, 200));
    }
  }

  if (!narrationUrl) {
    ttsError = errors.join(" | ").substring(0, 500);
  }

  return {
    narrationUrl,
    narrationChars,
    musicPrompt: musicBrief.musicPrompt,
    sfxSuggestions: musicBrief.sfxSuggestions,
    atmosphericNotes: musicBrief.atmosphericNotes,
    ttsModel,
    ttsProvider,
    tokenUsed,
    exhaustedKeys,
    error: ttsError,
  };
}

async function generateMusicBrief(script: GeneratedScript, emotionalArc: string): Promise<MusicBrief> {
  const prompt = `You are a Cinematic Music Director. Create a precise music brief for this video.

Video duration: ${Math.round(script.estimatedDuration / 60)} minutes
Emotional arc: ${emotionalArc}
Hook type: ${script.hookType}

Tension points occur at these moments:
${script.tensionPoints.map(t => `- ${t.timePercent}%: ${t.description} (${t.type})`).join("\n")}

Create a music production brief. Return JSON:
{
  "musicPrompt": "detailed description for AI music generation — genre, instruments, tempo, mood progression, specific sonic characteristics",
  "sfxSuggestions": ["specific sound effect 1 with timing note", "sound effect 2", "sound effect 3", "sound effect 4"],
  "atmosphericNotes": "ambient sound design description — what the listener hears beneath the music",
  "paceDescription": "how the music tempo should evolve through the video",
  "instrumentationNotes": "which instruments carry which emotional moments"
}`;

  return ytLLMJson<MusicBrief>(prompt, YT_MODELS.SCRIPT);
}
