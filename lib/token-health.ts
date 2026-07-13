import { prisma } from "./prisma";

// Persistent per-token credit-exhaustion tracker.
// When a token returns "credits depleted", we mark it with a cooldown so future
// requests across the whole app skip it for the cooldown window. Without this,
// every fresh pipeline runs the same dead token through the whole rotation.

const KEY = "hf_token_health";
const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

interface TokenHealthRecord {
  exhaustedUntil?: string; // ISO date
  lastError?: string;
  failureCount?: number;
}

type HealthMap = Record<string, TokenHealthRecord>;

function tokenId(token: string): string {
  // Fingerprint that's stable but not the full secret. First 6 + last 4 + length.
  const t = token.trim();
  if (t.length < 12) return `short:${t.length}`;
  return `${t.slice(0, 6)}_${t.slice(-4)}_${t.length}`;
}

async function readMap(): Promise<HealthMap> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as HealthMap;
  } catch {
    return {};
  }
}

async function writeMap(map: HealthMap): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(map) },
    create: { key: KEY, value: JSON.stringify(map) },
  }).catch(() => {});
}

export async function isTokenHealthy(token: string): Promise<boolean> {
  const map = await readMap();
  const rec = map[tokenId(token)];
  if (!rec?.exhaustedUntil) return true;
  const until = Date.parse(rec.exhaustedUntil);
  if (isNaN(until)) return true;
  return Date.now() >= until;
}

export async function markTokenExhausted(
  token: string,
  reason: string = "credits depleted",
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): Promise<void> {
  const map = await readMap();
  const id = tokenId(token);
  const existing = map[id] ?? {};
  map[id] = {
    exhaustedUntil: new Date(Date.now() + cooldownMs).toISOString(),
    lastError: reason.slice(0, 200),
    failureCount: (existing.failureCount ?? 0) + 1,
  };
  await writeMap(map);
}

export async function markTokenHealthy(token: string): Promise<void> {
  const map = await readMap();
  const id = tokenId(token);
  if (map[id]) {
    delete map[id];
    await writeMap(map);
  }
}

export async function filterHealthyTokens(tokens: string[]): Promise<string[]> {
  if (tokens.length === 0) return tokens;
  const map = await readMap();
  const now = Date.now();
  const healthy = tokens.filter(t => {
    const rec = map[tokenId(t)];
    if (!rec?.exhaustedUntil) return true;
    const until = Date.parse(rec.exhaustedUntil);
    return isNaN(until) || now >= until;
  });
  // If filtering removed everything, return all tokens — better to retry a
  // possibly-exhausted token than to fail the whole pipeline.
  return healthy.length > 0 ? healthy : tokens;
}

export async function getTokenHealthReport(): Promise<Array<{
  id: string;
  exhaustedUntil: string;
  lastError?: string;
  failureCount: number;
}>> {
  const map = await readMap();
  const now = Date.now();
  return Object.entries(map)
    .filter(([_, rec]) => rec.exhaustedUntil && Date.parse(rec.exhaustedUntil) > now)
    .map(([id, rec]) => ({
      id,
      exhaustedUntil: rec.exhaustedUntil!,
      lastError: rec.lastError,
      failureCount: rec.failureCount ?? 0,
    }));
}
