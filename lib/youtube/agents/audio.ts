import { generateTts } from "../../media";
import { prisma } from "../../prisma";
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
  // Music brief is just metadata — no music generator consumes it downstream.
  // Derive it deterministically from the script's emotional data instead of
  // burning an LLM call per video.
  const musicBrief = buildMusicBrief(script, emotionalArcDescription);

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

function buildMusicBrief(script: GeneratedScript, emotionalArc: string): MusicBrief {
  const minutes = Math.max(1, Math.round(script.estimatedDuration / 60));
  const peakEmotion = (script.emotionalArc ?? [])
    .slice()
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0]?.emotion ?? "introspective";
  const openingEmotion = script.emotionalArc?.[0]?.emotion ?? "curiosity";

  const moodLookup: Record<string, { instruments: string; tempo: string; texture: string }> = {
    curiosity:      { instruments: "soft piano, sparse synth pads, subtle pulse", tempo: "60-80 bpm rising", texture: "intimate, slowly building" },
    awe:            { instruments: "swelling strings, ambient pads, slow drone", tempo: "65-75 bpm sustained", texture: "expansive, reverberant" },
    nostalgia:      { instruments: "warm Rhodes, tape-saturated strings, vinyl crackle", tempo: "70 bpm steady", texture: "hazy, memory-like" },
    fear:           { instruments: "low cello, dissonant drones, occasional metallic hits", tempo: "55-70 bpm uneasy", texture: "dark, claustrophobic" },
    inspiration:    { instruments: "uplifting piano, layered strings, soft percussion", tempo: "80-95 bpm building", texture: "open, ascending" },
    grief:          { instruments: "solo cello, distant piano, ambient hush", tempo: "50-65 bpm slow", texture: "fragile, suspended" },
    anger:          { instruments: "distorted bass, driving low strings, kick pulse", tempo: "90-110 bpm relentless", texture: "tense, weighted" },
    hope:           { instruments: "rising strings, bright piano arpeggios, soft brass", tempo: "75-90 bpm opening", texture: "luminous, warming" },
    realization:    { instruments: "single piano line resolving into pads, gentle bell", tempo: "70 bpm with release", texture: "clarifying" },
    transformation: { instruments: "full strings, layered choir pads, resolving brass", tempo: "80-100 bpm triumphant", texture: "expansive resolution" },
    unease:         { instruments: "minor key piano, low strings, distant percussion", tempo: "60-75 bpm restless", texture: "uncertain, looming" },
  };

  const mood = moodLookup[peakEmotion.toLowerCase()] ?? moodLookup.curiosity;
  const opener = moodLookup[openingEmotion.toLowerCase()] ?? moodLookup.curiosity;

  const musicPrompt = `Cinematic ambient score, ${minutes} minutes. Opens with ${opener.texture} (${opener.instruments}, ${opener.tempo}), evolves into ${mood.texture} at the emotional peak (${mood.instruments}). Arc: ${emotionalArc}. Mix lives behind the narration — never overpowers.`;

  const sfxSuggestions = [
    "Soft ambient room tone under the hook (subtle, continuous)",
    "Low sub-bass swell at first tension point",
    "Brief silence + breath sound at the revelation beat",
    "Resolving texture sweep on the final payoff",
  ];

  const atmosphericNotes = `${opener.texture} ambient bed throughout. Wind, distant noise, or vinyl crackle for ${openingEmotion} sections. Lift to ${mood.texture} during peak emotional moments. Strategic silence around tension turns.`;

  const paceDescription = `Starts at ${opener.tempo}, gradually shifts to ${mood.tempo} across the ${minutes}-minute arc, easing back into resolution in the final 15%.`;

  const instrumentationNotes = `Opening (${openingEmotion}): ${opener.instruments}. Peak (${peakEmotion}): ${mood.instruments}. Resolution: pull back to opening palette plus sustained pad.`;

  return { musicPrompt, sfxSuggestions, atmosphericNotes, paceDescription, instrumentationNotes };
}
