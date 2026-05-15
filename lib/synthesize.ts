import { prisma } from "./prisma";

// ─── Endpoints ────────────────────────────────────────────────────────────────
const HF_ROUTER_URL  = "https://router.huggingface.co/v1/chat/completions";
const GROQ_API_URL   = "https://api.groq.com/openai/v1/chat/completions";

export const DEFAULT_HF_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

// ─── Groq model mapping ────────────────────────────────────────────────────────
// Groq only hosts a subset of models — map HF model IDs to the closest Groq equivalent.
const GROQ_MODEL_MAP: Record<string, string> = {
  "meta-llama/Llama-3.3-70B-Instruct":       "llama-3.3-70b-versatile",
  "Qwen/Qwen2.5-72B-Instruct":               "llama-3.3-70b-versatile",
  "Qwen/Qwen2.5-32B-Instruct":               "qwen-qwq-32b",
  "deepseek-ai/DeepSeek-V3":                 "llama-3.3-70b-versatile",
  "mistralai/Mixtral-8x22B-Instruct-v0.1":  "mixtral-8x7b-32768",
  "mistralai/Mistral-Large-Instruct-2411":   "llama-3.3-70b-versatile",
  "google/gemma-2-27b-it":                   "gemma2-9b-it",
};

function toGroqModel(hfModel: string): string {
  return GROQ_MODEL_MAP[hfModel] ?? "llama-3.3-70b-versatile";
}

// ─── Round-robin pool ──────────────────────────────────────────────────────────
let _rrIdx = 0;
export function rotatePool(keys: string[]): string[] {
  if (keys.length <= 1) return keys;
  const start = _rrIdx % keys.length;
  _rrIdx = (_rrIdx + 1) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

// ─── JSON cleanup ──────────────────────────────────────────────────────────────
export function cleanJson(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(/```json\s?/g, "").replace(/```/g, "").trim();
  try { JSON.parse(cleaned); return cleaned; } catch {}
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return cleaned.substring(start, end + 1);
  return cleaned;
}

// ─── Key helpers ───────────────────────────────────────────────────────────────
async function collectHfKeys(): Promise<string[]> {
  const dbKeys: string[] = [];

  const jsonRow = await prisma.systemSetting.findUnique({ where: { key: "hf_tokens" } }).catch(() => null);
  if (jsonRow?.value) {
    try {
      const arr = JSON.parse(jsonRow.value);
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (typeof t?.value === "string" && t.value.trim().length > 0) dbKeys.push(t.value.trim());
        }
      }
    } catch {}
  }

  const csvRow = await prisma.systemSetting.findUnique({ where: { key: "hf_api_keys" } }).catch(() => null);
  if (csvRow?.value) {
    csvRow.value.split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0).forEach((k: string) => dbKeys.push(k));
  }

  const envKeys = [
    process.env.HF_TOKEN,
    process.env.HUGGINGFACE_API_KEY,
    process.env.HUGGING_FACE_HUB_TOKEN,
  ].filter(Boolean) as string[];

  return Array.from(new Set([...envKeys, ...dbKeys].map((k) => String(k || "").trim()).filter((k) => k.length > 0)))
    .filter((k) => {
      const lower = k.toLowerCase();
      return !lower.includes("your-api-key") && !lower.includes("placeholder") && k !== "HF_TOKEN_HERE" && k.length >= 10;
    })
    .map((k) => k.replace(/["']/g, "").replace(/[^\x21-\x7E]/g, "").trim());
}

async function collectGroqKeys(): Promise<string[]> {
  const keys: string[] = [];

  // From env
  if (process.env.GROQ_API_KEY?.trim()) keys.push(process.env.GROQ_API_KEY.trim());

  // From DB (stored as JSON array of {value, label} or as plain string)
  const dbRow = await prisma.systemSetting.findUnique({ where: { key: "groq_keys" } }).catch(() => null);
  if (dbRow?.value) {
    try {
      const arr = JSON.parse(dbRow.value);
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const v = typeof t === "string" ? t : t?.value;
          if (typeof v === "string" && v.trim().startsWith("gsk_")) keys.push(v.trim());
        }
      }
    } catch {
      // plain string
      if (dbRow.value.trim().startsWith("gsk_")) keys.push(dbRow.value.trim());
    }
  }

  return Array.from(new Set(keys));
}

export async function listValidHfKeys(): Promise<string[]> {
  return collectHfKeys();
}

// ─── Credit / error classifiers ────────────────────────────────────────────────
function isCreditsExhausted(msg: string): boolean {
  const l = msg.toLowerCase();
  return l.includes("depleted") || l.includes("purchase pre-paid") || l.includes("subscribe to pro") || l.includes("credits_depleted");
}

function isRotatable(status: number, msg: string): boolean {
  const l = msg.toLowerCase();
  return [401, 402, 403, 429].includes(status) || l.includes("quota") || l.includes("rate") || l.includes("depleted");
}

// ─── OpenAI-compatible call (shared by both Groq and HF) ──────────────────────
async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  wantsJson: boolean,
  config: any
): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: config?.temperature ?? 0.7,
    max_tokens: config?.maxOutputTokens ?? 4096,
    stream: false,
  };
  if (wantsJson) body.response_format = { type: "json_object" };

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw Object.assign(new Error(errText.slice(0, 400)), { status: resp.status, body: errText });
  }

  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from API.");
  return text;
}

// ─── Main synthesize ───────────────────────────────────────────────────────────
// config.groqKeyOverride — if set, this key is tried first (before global pool)
// config.hfTokenOverride — if set, this token is tried first (before global pool)
export async function synthesizeContent(
  prompt: string,
  modelName: string = DEFAULT_HF_MODEL,
  config: any = {}
): Promise<string> {
  const wantsJson = config?.responseMimeType === "application/json";
  const targetModel = modelName || DEFAULT_HF_MODEL;
  const groqOverride: string | undefined = config?.groqKeyOverride?.trim() || undefined;
  const hfOverride: string | undefined = config?.hfTokenOverride?.trim() || undefined;

  // ── 1. Try Groq first (free, fast, no credits) ────────────────────────────
  const baseGroqKeys = await collectGroqKeys();
  const groqKeys = groqOverride
    ? [groqOverride, ...baseGroqKeys.filter((k) => k !== groqOverride)]
    : baseGroqKeys;
  if (groqKeys.length > 0) {
    const groqModel = toGroqModel(targetModel);
    for (const key of groqKeys) {
      try {
        console.log(`[Groq] Model: ${groqModel} (mapped from ${targetModel})`);
        const text = await callOpenAiCompatible(GROQ_API_URL, key, groqModel, prompt, wantsJson, config);
        return text;
      } catch (e: any) {
        const msg = e?.message || String(e);
        const status = e?.status ?? 0;
        console.warn(`[Groq] Failed (${status}): ${msg.slice(0, 120)}`);
        // Only rotate on rate limit — other Groq errors fall through to HF
        if (status === 429 || msg.includes("rate_limit")) continue;
        // For non-rate-limit errors on Groq, still try HF
        break;
      }
    }
    console.warn("[Groq] All keys failed or rate-limited — falling back to HF router.");
  }

  // ── 2. Fall back to HF token pool ─────────────────────────────────────────
  const baseHfKeys = await collectHfKeys();
  const hfKeys = hfOverride
    ? [hfOverride, ...baseHfKeys.filter((k) => k !== hfOverride)]
    : baseHfKeys;

  if (hfKeys.length === 0 && groqKeys.length === 0) {
    throw new Error(
      "NO_PROVIDER: No API keys configured. Add a free Groq key at console.groq.com (recommended) or a Hugging Face token in Settings → Token Pool."
    );
  }

  if (hfKeys.length === 0) {
    throw new Error(
      "All Groq keys failed and no HF tokens are configured. Add more Groq keys or add HF tokens in Settings."
    );
  }

  const workersToTry = rotatePool(hfKeys);
  let lastError: any = null;
  let allCreditsExhausted = true;

  for (const apiKey of workersToTry) {
    const masked = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
    console.log(`[HF Router] Model: ${targetModel} | Key: ${masked}`);

    try {
      const text = await callOpenAiCompatible(HF_ROUTER_URL, apiKey, targetModel, prompt, wantsJson, config);
      return text;
    } catch (e: any) {
      const msg: string = e?.message || String(e);
      const status: number = e?.status ?? 0;
      lastError = e;

      if (!isCreditsExhausted(msg)) allCreditsExhausted = false;

      if (isRotatable(status, msg) && workersToTry.length > 1) {
        console.warn(`[HF Failover] Rotating key. Cause: ${status || msg.slice(0, 60)}`);
        continue;
      }

      // HF-specific: retry without response_format if the model rejects it
      if (wantsJson && msg.toLowerCase().includes("response_format")) {
        try {
          console.warn("[HF] Retrying without response_format...");
          const text = await callOpenAiCompatible(HF_ROUTER_URL, apiKey, targetModel, prompt, false, config);
          return text;
        } catch {}
      }

      throw new Error(isCreditsExhausted(msg)
        ? "CREDITS_DEPLETED: HF credits exhausted on this token. Add a free Groq key in Settings — no credits needed."
        : `HF error: ${msg.slice(0, 200)}`
      );
    }
  }

  if (allCreditsExhausted) {
    throw new Error(
      "HF credits depleted on ALL tokens. Fix: Add a free Groq key in Settings → Groq Keys (get one at console.groq.com — no credit card, no monthly limit)."
    );
  }
  throw new Error(`All HF tokens failed. Last: ${lastError?.message?.slice(0, 200) ?? "unknown"}`);
}
