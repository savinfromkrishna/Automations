export type Role = "extract" | "write" | "refine" | "image" | "video" | "faq" | "social" | "translate" | "summarize" | "tts";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  badges?: string[];
  context?: string;
}

export const CATALOG: Record<Role, ModelOption[]> = {
  extract: [
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      label: "Qwen 2.5 · 72B",
      description: "Top-tier structured extraction. Excellent at JSON, entities, and faithfulness to source.",
      badges: ["Recommended", "Structured"],
      context: "128k",
    },
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      label: "Llama 3.3 · 70B",
      description: "Balanced extractor with strong factual grounding.",
      badges: ["General"],
      context: "128k",
    },
    {
      id: "deepseek-ai/DeepSeek-V3",
      label: "DeepSeek V3 · 671B MoE",
      description: "Massive MoE — high precision on complex, multi-page corpora.",
      badges: ["Heavy"],
      context: "64k",
    },
    {
      id: "mistralai/Mixtral-8x22B-Instruct-v0.1",
      label: "Mixtral 8x22B",
      description: "Fast MoE alternative for extraction.",
      badges: ["Fast"],
      context: "64k",
    },
    {
      id: "Qwen/Qwen2.5-32B-Instruct",
      label: "Qwen 2.5 · 32B",
      description: "Smaller Qwen — lower cost, still strong at structured output.",
      badges: ["Budget"],
      context: "128k",
    },
  ],
  write: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      label: "Llama 3.3 · 70B",
      description: "Best-in-class long-form writer. Natural cadence, strong structure.",
      badges: ["Recommended", "Long-form"],
      context: "128k",
    },
    {
      id: "deepseek-ai/DeepSeek-V3",
      label: "DeepSeek V3",
      description: "Editorial polish and depth. Slightly slower, denser prose.",
      badges: ["Premium"],
      context: "64k",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      label: "Qwen 2.5 · 72B",
      description: "Crisp, structured prose. Strong on technical content.",
      badges: ["Technical"],
      context: "128k",
    },
    {
      id: "mistralai/Mistral-Large-Instruct-2411",
      label: "Mistral Large 2411",
      description: "European model with excellent multilingual writing.",
      badges: ["Multilingual"],
      context: "128k",
    },
    {
      id: "google/gemma-2-27b-it",
      label: "Gemma 2 · 27B",
      description: "Lightweight, fast drafts.",
      badges: ["Fast", "Budget"],
      context: "8k",
    },
  ],
  refine: [
    {
      id: "deepseek-ai/DeepSeek-V3",
      label: "DeepSeek V3",
      description: "Sharp editorial pass — best at SEO tightening and meta optimization.",
      badges: ["Recommended", "SEO"],
      context: "64k",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      label: "Qwen 2.5 · 72B",
      description: "Disciplined refiner with strong keyword integration.",
      badges: ["Structured"],
      context: "128k",
    },
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      label: "Llama 3.3 · 70B",
      description: "Consistent voice — minimizes tonal drift during refinement.",
      badges: ["Consistent"],
      context: "128k",
    },
  ],
  image: [
    {
      id: "black-forest-labs/FLUX.1-schnell",
      label: "FLUX.1 Schnell",
      description: "Fast, high-quality text-to-image. 4 steps, photorealistic.",
      badges: ["Recommended", "Fast"],
    },
    {
      id: "black-forest-labs/FLUX.1-dev",
      label: "FLUX.1 Dev",
      description: "Higher fidelity FLUX variant. Slower, more detailed.",
      badges: ["Premium"],
    },
    {
      id: "stabilityai/stable-diffusion-3.5-large",
      label: "Stable Diffusion 3.5 Large",
      description: "Stability AI's latest flagship — strong prompt adherence.",
      badges: ["Flagship"],
    },
    {
      id: "stabilityai/stable-diffusion-3.5-large-turbo",
      label: "SD 3.5 Large Turbo",
      description: "Turbo variant — 4 steps, near-flagship quality.",
      badges: ["Fast"],
    },
    {
      id: "stabilityai/stable-diffusion-xl-base-1.0",
      label: "SDXL Base 1.0",
      description: "Stable workhorse. Wide style coverage.",
      badges: ["Versatile"],
    },
  ],
  video: [
    {
      id: "Wan-AI/Wan2.1-T2V-14B",
      label: "Wan 2.1 T2V · 14B",
      description: "Stable text-to-video. Widely available on fal-ai, replicate, and novita.",
      badges: ["Recommended", "Text→Video", "Stable"],
    },
    {
      id: "Wan-AI/Wan2.2-T2V-A14B",
      label: "Wan 2.2 T2V · 14B",
      description: "Latest Wan flagship. Requires fal-ai or replicate credits.",
      badges: ["Text→Video", "Latest"],
    },
    {
      id: "tencent/HunyuanVideo",
      label: "Hunyuan Video",
      description: "High-quality 720p text-to-video. Heavy — sometimes only via Endpoint.",
      badges: ["Premium"],
    },
    {
      id: "genmo/mochi-1-preview",
      label: "Mochi 1 Preview",
      description: "Genmo's open text-to-video. Strong motion fidelity.",
      badges: ["Text→Video"],
    },
    {
      id: "Lightricks/LTX-Video",
      label: "LTX-Video (img→video)",
      description: "Real-time image-to-video. Use after an Image node to animate it.",
      badges: ["Image→Video", "Fast"],
    },
    {
      id: "stabilityai/stable-video-diffusion-img2vid-xt",
      label: "SVD-XT (img→video)",
      description: "Stable Video Diffusion. Image-to-video. Reliable, short clips.",
      badges: ["Image→Video"],
    },
  ],
  faq: [
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", description: "Sharp at PAA-style FAQ phrasing.", badges: ["Recommended"] },
    { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 · 72B", description: "Tight structured FAQ output.", badges: ["Structured"] },
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 · 70B", description: "Balanced FAQ writer.", badges: ["General"] },
  ],
  social: [
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 · 70B", description: "Natural voice for Twitter/LinkedIn.", badges: ["Recommended"] },
    { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 · 72B", description: "Strong hooks and punchy lines.", badges: ["Punchy"] },
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", description: "Editorial polish, great LinkedIn long-form.", badges: ["Polished"] },
  ],
  translate: [
    { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 · 72B", description: "Top multilingual coverage.", badges: ["Recommended", "Multilingual"] },
    { id: "mistralai/Mistral-Large-Instruct-2411", label: "Mistral Large 2411", description: "European multilingual flagship.", badges: ["EU"] },
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 · 70B", description: "Solid EN ↔ major-language translator.", badges: ["General"] },
  ],
  summarize: [
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", description: "Dense, accurate summaries.", badges: ["Recommended"] },
    { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 · 72B", description: "Faithful, structured TL;DR.", badges: ["Faithful"] },
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 · 70B", description: "Readable, natural-voice summaries.", badges: ["Natural"] },
  ],
  tts: [
    { id: "facebook/mms-tts-eng", label: "MMS TTS · English", description: "Fast, reliable serverless TTS.", badges: ["Recommended", "Fast"] },
    { id: "suno/bark", label: "Bark", description: "Expressive voice + non-verbal sounds. Heavier.", badges: ["Expressive"] },
    { id: "coqui/XTTS-v2", label: "Coqui XTTS-v2", description: "Voice cloning, multilingual. Often needs Endpoint.", badges: ["Premium", "Endpoint"] },
  ],
};

export const DEFAULTS: Record<Role, string> = {
  extract: "Qwen/Qwen2.5-72B-Instruct",
  write: "meta-llama/Llama-3.3-70B-Instruct",
  refine: "deepseek-ai/DeepSeek-V3",
  image: "black-forest-labs/FLUX.1-schnell",
  video: "Wan-AI/Wan2.1-T2V-14B",
  faq: "deepseek-ai/DeepSeek-V3",
  social: "meta-llama/Llama-3.3-70B-Instruct",
  translate: "Qwen/Qwen2.5-72B-Instruct",
  summarize: "deepseek-ai/DeepSeek-V3",
  tts: "facebook/mms-tts-eng",
};

export function getModel(role: Role, requested?: string): string {
  if (!requested) return DEFAULTS[role];
  const inCatalog = CATALOG[role].some((m) => m.id === requested);
  return inCatalog ? requested : requested; // allow custom model IDs the user typed
}
