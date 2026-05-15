import { InferenceClient } from "@huggingface/inference";
import { listValidHfKeys, rotatePool } from "./synthesize";

export interface ImageResult {
  url: string;
  contentType: string;
  bytes: number;
  model: string;
  provider: string;
  attemptedKeys: number;
  tokenUsed?: string; // masked for logging
  exhaustedKeys?: string[]; // masked list of tokens that hit credit limit
}

export interface VideoResult {
  url: string;
  contentType: string;
  bytes: number;
  model: string;
  provider: string;
  attemptedKeys: number;
  tokenUsed?: string;
  exhaustedKeys?: string[];
}

export interface TtsResult {
  url: string;
  contentType: string;
  bytes: number;
  model: string;
  provider: string;
  chars: number;
  tokenUsed?: string;
  exhaustedKeys?: string[];
}

// Providers we'll auto-try if "auto" routing fails. Order matters — cheapest/most reliable first.
const PROVIDER_FALLBACKS = ["fal-ai", "replicate", "novita", "together", "nebius", "hyperbolic", "hf-inference"] as const;
type Provider = (typeof PROVIDER_FALLBACKS)[number] | "auto";

// Image model fallback chain — if a model fails all providers, retry with the next
const IMAGE_FALLBACK_CHAIN: Record<string, string> = {
  "black-forest-labs/FLUX.1-dev":              "black-forest-labs/FLUX.1-schnell",
  "black-forest-labs/FLUX.1-schnell":          "stabilityai/stable-diffusion-xl-base-1.0",
  "stabilityai/stable-diffusion-xl-base-1.0":  "runwayml/stable-diffusion-v1-5",
};

// If a video model fails all providers, automatically retry with the next model in the chain
const VIDEO_FALLBACK_CHAIN: Record<string, string> = {
  "Wan-AI/Wan2.2-T2V-A14B": "Wan-AI/Wan2.1-T2V-14B",
  "Wan-AI/Wan2.1-T2V-14B":  "genmo/mochi-1-preview",
};

async function blobToDataUrl(blob: Blob): Promise<{ url: string; contentType: string; bytes: number }> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || "application/octet-stream";
  return {
    url: `data:${contentType};base64,${buf.toString("base64")}`,
    contentType,
    bytes: buf.byteLength,
  };
}

function maskKey(key: string): string {
  if (!key || key.length < 12) return "***";
  return `${key.substring(0, 6)}…${key.substring(key.length - 4)}`;
}

function isCreditExhausted(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("depleted") || msg.includes("out of credits") || msg.includes("purchase pre-paid") || msg.includes("subscribe to pro") || msg.includes("payment required") || msg.includes("402");
}

function isRetryable(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("rate") || msg.includes("quota") || msg.includes("loading") || msg.includes("503") || msg.includes("429") || msg.includes("401") || msg.includes("403");
}

function isProviderRejection(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("not supported") || msg.includes("not found") || msg.includes("404") || msg.includes("400");
}

function buildKeyPool(tokenOverride: string | undefined, poolKeys: string[]): string[] {
  if (!tokenOverride) return poolKeys;
  return [tokenOverride, ...poolKeys.filter((k) => k !== tokenOverride)];
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  model: string,
  opts: { width?: number; height?: number; steps?: number; guidance?: number; hfToken?: string } = {}
): Promise<ImageResult> {
  const { hfToken: tokenOverride, ...imgOpts } = opts;
  const poolKeys = await listValidHfKeys();
  const allKeys = buildKeyPool(tokenOverride?.trim(), poolKeys);
  if (allKeys.length === 0) throw new Error("NO_TOKEN: Add a Hugging Face token in Settings.");

  const params: any = {};
  if (imgOpts.width) params.width = imgOpts.width;
  if (imgOpts.height) params.height = imgOpts.height;
  if (imgOpts.steps) params.num_inference_steps = imgOpts.steps;
  if (imgOpts.guidance) params.guidance_scale = imgOpts.guidance;

  const triedKeys = rotatePool(allKeys);
  const envProvider = (process.env.HF_PROVIDER || "").trim() as Provider;
  const providerOrder: Provider[] = envProvider
    ? [envProvider, ...PROVIDER_FALLBACKS.filter((p) => p !== envProvider)]
    : ["auto", ...PROVIDER_FALLBACKS];

  const errors: string[] = [];
  const exhausted = new Set<string>(); // tokens that hit credit limit this call

  // Walk the model fallback chain
  let currentModel: string | undefined = model;
  const triedModels: string[] = [];

  while (currentModel && !triedModels.includes(currentModel)) {
    triedModels.push(currentModel);

    for (const provider of providerOrder) {
      // If all our keys are exhausted globally, no point continuing
      if (exhausted.size >= triedKeys.length) break;

      for (const apiKey of triedKeys) {
        if (exhausted.has(apiKey)) continue;

        try {
          const client = new InferenceClient(apiKey);
          const blob = await client.textToImage({
            model: currentModel,
            inputs: prompt,
            parameters: Object.keys(params).length ? params : undefined,
            provider: provider === "auto" ? undefined : (provider as any),
          }, { outputType: "blob" });
          const data = await blobToDataUrl(blob);
          return {
            ...data,
            model: currentModel,
            provider: provider === "auto" ? "auto" : provider,
            attemptedKeys: triedKeys.indexOf(apiKey) + 1,
            tokenUsed: maskKey(apiKey),
            exhaustedKeys: Array.from(exhausted).map(maskKey),
          };
        } catch (e: any) {
          const msg = e?.message || String(e);
          errors.push(`[${currentModel}] ${provider} (${maskKey(apiKey)}): ${msg.slice(0, 160)}`);

          // Credit exhausted? skip this key for the rest of this call
          if (isCreditExhausted(e)) {
            exhausted.add(apiKey);
            continue; // try next key with same provider
          }
          // Provider doesn't support this model — try next provider
          if (isProviderRejection(e)) break;
          // Rate-limited or transient — try next key (might be that key's limit)
          if (isRetryable(e)) continue;
          // Unknown error — also try next key (don't give up after one bad request)
          continue;
        }
      }
    }

    currentModel = IMAGE_FALLBACK_CHAIN[currentModel];
  }

  const exhaustedList = Array.from(exhausted).map(maskKey);
  throw new Error(
    `IMAGE_FAILED: Models tried: ${triedModels.join(" → ")}. ` +
    (exhaustedList.length ? `Exhausted tokens: ${exhaustedList.join(", ")}. ` : "") +
    `Last errors: ${errors.slice(-3).join(" || ")}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO GENERATION
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_TO_VIDEO_MODELS = new Set([
  "Lightricks/LTX-Video",
  "stabilityai/stable-video-diffusion-img2vid-xt",
  "stabilityai/stable-video-diffusion-img2vid",
]);

function isImageToVideoModel(model: string): boolean {
  if (IMAGE_TO_VIDEO_MODELS.has(model)) return true;
  const lower = model.toLowerCase();
  return lower.includes("img2vid") || lower.includes("i2v") || lower.includes("image-to-video");
}

const VIDEO_PROVIDERS: Provider[] = ["fal-ai", "replicate", "novita"];

async function tryGenerateVideo(
  prompt: string,
  model: string,
  imageBlob: Blob | undefined,
  useImageToVideo: boolean,
  params: any,
  triedKeys: string[],
  providerOrder: Provider[],
  allErrors: string[],
  exhausted: Set<string>
): Promise<VideoResult | null> {
  for (const provider of providerOrder) {
    if (exhausted.size >= triedKeys.length) break;

    for (const apiKey of triedKeys) {
      if (exhausted.has(apiKey)) continue;

      try {
        const client = new InferenceClient(apiKey);
        let blob: Blob;
        if (useImageToVideo) {
          blob = await client.imageToVideo({
            model,
            inputs: imageBlob!,
            parameters: { ...params, prompt } as any,
            provider: provider === "auto" ? undefined : (provider as any),
          } as any);
        } else {
          blob = await client.textToVideo({
            model,
            inputs: prompt,
            parameters: Object.keys(params).length ? params : undefined,
            provider: provider === "auto" ? undefined : (provider as any),
          });
        }
        const data = await blobToDataUrl(blob);
        return {
          ...data,
          model,
          provider: provider === "auto" ? "auto" : provider,
          attemptedKeys: triedKeys.indexOf(apiKey) + 1,
          tokenUsed: maskKey(apiKey),
          exhaustedKeys: Array.from(exhausted).map(maskKey),
        };
      } catch (e: any) {
        const msg = e?.message || String(e);
        allErrors.push(`[${model}] ${provider} (${maskKey(apiKey)}): ${msg.slice(0, 200)}`);

        // Credit exhausted? Skip this token for the rest of this call but KEEP TRYING others.
        if (isCreditExhausted(e)) {
          exhausted.add(apiKey);
          continue;
        }
        if (isProviderRejection(e)) break;
        if (isRetryable(e)) continue;
        continue;
      }
    }
  }
  return null;
}

export async function generateVideo(
  prompt: string,
  model: string,
  opts: { numFrames?: number; fps?: number; image?: Blob | string; hfToken?: string } = {}
): Promise<VideoResult> {
  const { hfToken: tokenOverride, image, numFrames, fps } = opts;
  const poolKeys = await listValidHfKeys();
  const allKeys = buildKeyPool(tokenOverride?.trim(), poolKeys);
  if (allKeys.length === 0) throw new Error("NO_TOKEN: Add a Hugging Face token in Settings.");

  const params: any = {};
  if (numFrames) params.num_frames = numFrames;
  if (fps) params.fps = fps;

  const triedKeys = rotatePool(allKeys);
  const envProvider = (process.env.HF_PROVIDER || "").trim() as Provider;
  const providerOrder: Provider[] = envProvider
    ? [envProvider, ...VIDEO_PROVIDERS.filter((p) => p !== envProvider)]
    : ["auto", ...VIDEO_PROVIDERS];

  const useImageToVideo = isImageToVideoModel(model) || !!image;

  if (useImageToVideo && !image) {
    throw new Error(
      `Model ${model} is image-to-video only. Add an Image node upstream of this Video node so we can use its output as the source image.`
    );
  }

  let imageBlob: Blob | undefined;
  if (image) {
    if (typeof image === "string") {
      const m = /^data:([^;]+);base64,(.+)$/.exec(image);
      if (!m) throw new Error("image must be a data: URL or Blob");
      const buf = Buffer.from(m[2], "base64");
      imageBlob = new Blob([buf], { type: m[1] });
    } else {
      imageBlob = image;
    }
  }

  const allErrors: string[] = [];
  const exhausted = new Set<string>();

  let currentModel: string | undefined = model;
  const triedModels: string[] = [];
  while (currentModel && !triedModels.includes(currentModel)) {
    triedModels.push(currentModel);
    const result = await tryGenerateVideo(prompt, currentModel, imageBlob, useImageToVideo, params, triedKeys, providerOrder, allErrors, exhausted);
    if (result) return result;
    currentModel = VIDEO_FALLBACK_CHAIN[currentModel];
  }

  const exhaustedList = Array.from(exhausted).map(maskKey);
  throw new Error(
    `VIDEO_FAILED: Models: ${triedModels.join(" → ")}. Providers: ${providerOrder.join(", ")}.` +
    (exhaustedList.length ? `\nExhausted tokens: ${exhaustedList.join(", ")} (skipped).` : "") +
    `\nTip: enable fal-ai at huggingface.co/settings/inference-providers for video.` +
    `\nLast errors:\n${allErrors.slice(-5).join("\n")}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-TO-SPEECH
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTts(
  text: string,
  model: string,
  opts: { hfToken?: string } = {}
): Promise<TtsResult> {
  const { hfToken: tokenOverride } = opts;
  const poolKeys = await listValidHfKeys();
  const allKeys = buildKeyPool(tokenOverride?.trim(), poolKeys);
  if (allKeys.length === 0) throw new Error("NO_TOKEN: Add a Hugging Face token in Settings.");

  const triedKeys = rotatePool(allKeys);
  const envProvider = (process.env.HF_PROVIDER || "").trim() as Provider;
  const providerOrder: Provider[] = envProvider
    ? [envProvider, "auto", ...PROVIDER_FALLBACKS.filter((p) => p !== envProvider)]
    : ["auto", "hf-inference", "fal-ai", "replicate"];

  const errors: string[] = [];
  const exhausted = new Set<string>();

  for (const provider of providerOrder) {
    if (exhausted.size >= triedKeys.length) break;

    for (const apiKey of triedKeys) {
      if (exhausted.has(apiKey)) continue;

      try {
        const client = new InferenceClient(apiKey);
        const blob = await client.textToSpeech({
          model,
          inputs: text,
          provider: provider === "auto" ? undefined : (provider as any),
        });
        const data = await blobToDataUrl(blob);
        return {
          ...data,
          model,
          provider: provider === "auto" ? "auto" : provider,
          chars: text.length,
          tokenUsed: maskKey(apiKey),
          exhaustedKeys: Array.from(exhausted).map(maskKey),
        };
      } catch (e: any) {
        const msg = e?.message || String(e);
        errors.push(`${provider} (${maskKey(apiKey)}): ${msg.slice(0, 160)}`);

        if (isCreditExhausted(e)) {
          exhausted.add(apiKey);
          continue;
        }
        if (isProviderRejection(e)) break;
        if (isRetryable(e)) continue;
        continue;
      }
    }
  }

  const exhaustedList = Array.from(exhausted).map(maskKey);
  throw new Error(
    `TTS_FAILED: Model ${model}. Providers: ${providerOrder.join(", ")}.` +
    (exhaustedList.length ? ` Exhausted: ${exhaustedList.join(", ")}.` : "") +
    ` Errors: ${errors.slice(-3).join(" || ")}`
  );
}
