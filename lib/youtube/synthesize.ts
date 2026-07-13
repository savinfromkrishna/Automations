import { synthesizeContent, cleanJson } from "../synthesize";

export const YT_MODELS = {
  TREND:    "meta-llama/Llama-3.3-70B-Instruct",
  RESEARCH: "Qwen/Qwen2.5-72B-Instruct",
  SCRIPT:   "meta-llama/Llama-3.3-70B-Instruct",
  SEO:      "meta-llama/Llama-3.3-70B-Instruct",
  QUALITY:  "Qwen/Qwen2.5-72B-Instruct",
  DEFAULT:  "meta-llama/Llama-3.3-70B-Instruct",
} as const;

// Per-agent output budgets sized to the JSON each agent actually returns.
// Providers (HF Router, OpenRouter, Groq) reserve compute against max_tokens —
// asking for 4096 when you need 600 inflates cost and rate-limit pressure.
export const YT_TOKEN_BUDGET = {
  TREND:        2200,   // 5 ideas with rich detail
  RESEARCH:     1100,   // niche blueprint
  INSIGHT:       750,   // insight set
  METAPHOR:     1100,   // metaphor map with 3 recurring elements
  SCRIPT_BASE:   400,   // overhead per call (sections, arc, etc.)
  STORYBOARD:   3500,   // many scenes, biggest output
  SEO:          1200,   // title/desc/tags/chapters
  AUDIO_BRIEF:   500,   // music brief (now skipped — see audio.ts)
  QUALITY:       500,   // report (now deterministic — see quality-checker.ts)
  MEMORY:        500,   // learnings list
  DEFAULT:      1500,
} as const;

export interface YtLlmOptions {
  wantsJson?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export async function ytLLM(
  prompt: string,
  model: string = YT_MODELS.DEFAULT,
  opts: YtLlmOptions = {}
): Promise<string> {
  return synthesizeContent(prompt, model, {
    responseMimeType: opts.wantsJson !== false ? "application/json" : undefined,
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxTokens ?? YT_TOKEN_BUDGET.DEFAULT,
  });
}

export async function ytLLMJson<T>(
  prompt: string,
  model: string = YT_MODELS.DEFAULT,
  opts: { retries?: number; maxTokens?: number; temperature?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const raw = await ytLLM(prompt, model, {
        wantsJson: true,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      });
      const cleaned = cleanJson(raw);
      return JSON.parse(cleaned) as T;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export { cleanJson };
