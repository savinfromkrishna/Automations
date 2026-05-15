import { NextResponse } from "next/server";
import { InferenceClient } from "@huggingface/inference";
import { listValidHfKeys } from "../../../../../lib/synthesize";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TokenHealth {
  token: string;            // masked
  raw: string;              // full (for retry actions, never exposed to client unmasked)
  whoami?: string;          // HF username if available
  llmOk: boolean;
  imageOk: boolean;
  ttsOk: boolean;
  videoProvidersEnabled: string[];
  errors: { llm?: string; image?: string; tts?: string };
  durationMs: number;
}

function mask(k: string): string {
  if (k.length < 12) return "***";
  return `${k.substring(0, 6)}…${k.substring(k.length - 4)}`;
}

async function testToken(rawKey: string): Promise<TokenHealth> {
  const t0 = Date.now();
  const result: TokenHealth = {
    token: mask(rawKey),
    raw: rawKey,
    llmOk: false,
    imageOk: false,
    ttsOk: false,
    videoProvidersEnabled: [],
    errors: {},
    durationMs: 0,
  };

  // 1) whoami — fastest check, validates the token format
  try {
    const r = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    if (r.ok) {
      const data = await r.json();
      result.whoami = data?.name ?? data?.fullname ?? "anonymous";
    }
  } catch {/* ignore */}

  // 2) Lightweight LLM ping — via HF Router (4 tokens of completion)
  try {
    const r = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.3-70B-Instruct",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
    });
    if (r.ok) result.llmOk = true;
    else result.errors.llm = `HTTP ${r.status}: ${(await r.text()).substring(0, 120)}`;
  } catch (e: any) {
    result.errors.llm = e.message?.substring(0, 200) ?? "unknown";
  }

  // 3) Image generation ping — tiny FLUX schnell render
  try {
    const client = new InferenceClient(rawKey);
    await client.textToImage(
      { model: "black-forest-labs/FLUX.1-schnell", inputs: "a dot", parameters: { width: 256, height: 256, num_inference_steps: 1 } as any },
      { outputType: "blob" }
    );
    result.imageOk = true;
  } catch (e: any) {
    result.errors.image = e.message?.substring(0, 200) ?? "unknown";
  }

  // 4) TTS ping — facebook/mms-tts-eng (smallest reliable TTS)
  try {
    const client = new InferenceClient(rawKey);
    await client.textToSpeech({ model: "facebook/mms-tts-eng", inputs: "hi" });
    result.ttsOk = true;
  } catch (e: any) {
    result.errors.tts = e.message?.substring(0, 200) ?? "unknown";
  }

  // 5) Detect which video providers are enabled for this token
  try {
    const r = await fetch("https://huggingface.co/api/inference-providers", {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    if (r.ok) {
      const data = await r.json();
      const enabled: string[] = [];
      if (Array.isArray(data)) {
        for (const p of data) {
          if (p?.enabled || p?.provider) enabled.push(p?.provider ?? p?.name ?? "?");
        }
      } else if (data && typeof data === "object") {
        for (const [name, info] of Object.entries(data)) {
          if ((info as any)?.enabled) enabled.push(name);
        }
      }
      result.videoProvidersEnabled = enabled;
    }
  } catch {/* ignore */}

  result.durationMs = Date.now() - t0;
  return result;
}

export async function GET() {
  try {
    const keys = await listValidHfKeys();
    if (keys.length === 0) {
      return NextResponse.json({ tokens: [], total: 0, healthy: 0, message: "No HF tokens configured. Add them in Settings → Token Pool." });
    }

    // Test all tokens in parallel
    const results = await Promise.all(keys.map(testToken));

    // Strip raw keys from response (only used internally)
    const sanitized = results.map(({ raw, ...rest }) => rest);

    const healthy = sanitized.filter(r => r.llmOk || r.imageOk || r.ttsOk).length;

    return NextResponse.json({
      tokens: sanitized,
      total: keys.length,
      healthy,
      summary: {
        llm: sanitized.filter(r => r.llmOk).length,
        image: sanitized.filter(r => r.imageOk).length,
        tts: sanitized.filter(r => r.ttsOk).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
