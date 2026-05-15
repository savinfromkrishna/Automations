import { prisma } from "./prisma";

export interface HfToken {
  id: string;
  label: string;
  value: string;       // full token
  addedAt: string;
  lastTestedAt?: string;
  lastStatus?: "ok" | "failed" | "untested";
  lastError?: string;
}

const KEY = "hf_tokens";
const LEGACY_KEY = "hf_api_keys"; // legacy CSV

function maskToken(t: string): string {
  const trimmed = (t || "").trim();
  if (trimmed.length < 12) return trimmed.replace(/./g, "•");
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

export async function readTokens(): Promise<HfToken[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  if (row?.value) {
    try {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr)) return arr;
    } catch {}
  }
  // fallback: migrate legacy CSV
  const legacy = await prisma.systemSetting.findUnique({ where: { key: LEGACY_KEY } });
  if (legacy?.value) {
    const csv = legacy.value.split(",").map((s) => s.trim()).filter(Boolean);
    return csv.map((v, i) => ({
      id: `legacy-${i}`,
      label: `Legacy token ${i + 1}`,
      value: v,
      addedAt: new Date().toISOString(),
      lastStatus: "untested",
    }));
  }
  return [];
}

export async function writeTokens(tokens: HfToken[]): Promise<void> {
  const cleaned = tokens.map((t) => ({ ...t, value: t.value.trim() })).filter((t) => t.value.length >= 8);
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(cleaned) },
    create: { key: KEY, value: JSON.stringify(cleaned) },
  });
  // also sync legacy CSV so existing readers keep working
  const csv = cleaned.map((t) => t.value).join(",");
  await prisma.systemSetting.upsert({
    where: { key: LEGACY_KEY },
    update: { value: csv },
    create: { key: LEGACY_KEY, value: csv },
  });
}

export function maskTokenList(tokens: HfToken[]): Array<Omit<HfToken, "value"> & { masked: string }> {
  return tokens.map((t) => ({ ...t, value: undefined as any, masked: maskToken(t.value) }));
}

export async function testToken(value: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${value}` },
    });
    if (resp.ok) return { ok: true };
    const text = await resp.text();
    return { ok: false, error: `HF ${resp.status}: ${text.slice(0, 160)}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "network error" };
  }
}
