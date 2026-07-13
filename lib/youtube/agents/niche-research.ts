import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import { prisma } from "../../prisma";
import type { NicheBlueprint, PipelineContext } from "../types";

// Niche blueprints don't change per-video — they describe the channel's audience.
// Cache hits = zero LLM calls. Cache key: channel + niche + subNiche + style + tone.
async function readCachedBlueprint(
  channelId: string,
  ctx: PipelineContext
): Promise<NicheBlueprint | null> {
  const key = `niche_blueprint:${channelId}:${ctx.niche}:${ctx.subNiche ?? ""}:${ctx.style}:${ctx.tone}`;
  const row = await prisma.systemSetting.findUnique({ where: { key } }).catch(() => null);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as NicheBlueprint;
  } catch {
    return null;
  }
}

async function writeCachedBlueprint(
  channelId: string,
  ctx: PipelineContext,
  blueprint: NicheBlueprint
): Promise<void> {
  const key = `niche_blueprint:${channelId}:${ctx.niche}:${ctx.subNiche ?? ""}:${ctx.style}:${ctx.tone}`;
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(blueprint) },
    create: { key, value: JSON.stringify(blueprint) },
  }).catch(() => {});
}

export async function runNicheResearchAgent(
  ctx: PipelineContext,
  concept: string
): Promise<NicheBlueprint> {
  if (ctx.channelId) {
    const cached = await readCachedBlueprint(ctx.channelId, ctx);
    if (cached) {
      console.log(`[NicheResearch] Cache HIT for ${ctx.niche} — skipping LLM call`);
      return cached;
    }
  }

  const prompt = `Audience psychology profile for "${ctx.niche}" channel, video concept: "${concept}".
Style: ${ctx.style} | Tone: ${ctx.tone}

Return JSON:
{
  "psychologicalProfile": "core viewer's inner world, life, aspirations",
  "coreDesires": ["",""],
  "painPoints": ["",""],
  "emotionalTriggers": ["",""],
  "successfulPatterns": ["",""],
  "visualLanguage": "aesthetics/colors/imagery that resonate",
  "pacingPreferences": "cuts/rhythm",
  "hookStyles": ["",""],
  "audienceJourney": "emotional arc from click to finish"
}`;

  const blueprint = await ytLLMJson<NicheBlueprint>(prompt, YT_MODELS.RESEARCH, {
    maxTokens: YT_TOKEN_BUDGET.RESEARCH,
    temperature: 0.7,
  });

  if (ctx.channelId) {
    await writeCachedBlueprint(ctx.channelId, ctx, blueprint);
  }
  return blueprint;
}
