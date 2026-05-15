import { synthesizeContent, cleanJson } from "../synthesize";

export const YT_MODELS = {
  TREND:    "meta-llama/Llama-3.3-70B-Instruct",
  RESEARCH: "Qwen/Qwen2.5-72B-Instruct",
  SCRIPT:   "meta-llama/Llama-3.3-70B-Instruct",
  SEO:      "deepseek-ai/DeepSeek-V3",
  QUALITY:  "Qwen/Qwen2.5-72B-Instruct",
  DEFAULT:  "meta-llama/Llama-3.3-70B-Instruct",
} as const;

export async function ytLLM(
  prompt: string,
  model: string = YT_MODELS.DEFAULT,
  wantsJson = true
): Promise<string> {
  return synthesizeContent(prompt, model, {
    responseMimeType: wantsJson ? "application/json" : undefined,
    temperature: 0.85,
    maxOutputTokens: 4096,
  });
}

export async function ytLLMJson<T>(
  prompt: string,
  model: string = YT_MODELS.DEFAULT,
  retries = 2
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const raw = await ytLLM(prompt, model, true);
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
