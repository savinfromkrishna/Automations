import { ytLLMJson, YT_MODELS, YT_TOKEN_BUDGET } from "../synthesize";
import type { SeoPackage, GeneratedScript, PipelineContext, ChapterMark } from "../types";

export async function runSeoGeneratorAgent(
  ctx: PipelineContext,
  concept: string,
  script: GeneratedScript,
  trendKeywords: string[]
): Promise<SeoPackage> {
  const prompt = `YouTube SEO package for "${concept}" (${ctx.niche}, ${Math.round(script.estimatedDuration/60)}min).
Hook: "${script.hook.slice(0, 120)}"
Trend keywords: ${trendKeywords.slice(0, 6).join(", ")}
Script open: ${script.fullScript.substring(0, 300)}

Title 50-60 chars. Description 300+ words with hook, CTA. 15 tags. 5 hashtags.

Return JSON:
{
  "title": "50-60 chars",
  "description": "300+ words with hook, CTA, chapters preview",
  "tags": ["",""],
  "hashtags": ["#",""],
  "chapters": [{"timestamp":"0:00","title":""}],
  "primaryKeyword": "",
  "keywordClusters": [["",""]],
  "ctrPrediction": 6.5,
  "searchVolume": "HIGH|MEDIUM|LOW",
  "thumbnailConcept": "composition, subject, overlay text position",
  "thumbnailText": "3-5 words",
  "thumbnailEmotion": "shock|curiosity|awe|fear|hope"
}`;

  try {
    return await ytLLMJson<SeoPackage>(prompt, YT_MODELS.SEO, {
      maxTokens: YT_TOKEN_BUDGET.SEO,
      temperature: 0.6,
    });
  } catch (err: any) {
    console.warn(
      `[SEO] LLM providers exhausted — using deterministic fallback. Cause: ${String(err?.message || err).slice(0, 160)}`
    );
    return buildFallbackSeoPackage(ctx, concept, script, trendKeywords);
  }
}

function buildFallbackSeoPackage(
  ctx: PipelineContext,
  concept: string,
  script: GeneratedScript,
  trendKeywords: string[]
): SeoPackage {
  const primaryKeyword = (trendKeywords[0] || ctx.niche || concept).toLowerCase().trim();
  const minutes = Math.max(1, Math.round(script.estimatedDuration / 60));

  const titleBase = concept.replace(/["“”]/g, "").trim();
  const titleCandidate = `${capitalize(titleBase)} — What Nobody Tells You About ${capitalize(primaryKeyword)}`;
  const title = titleCandidate.length > 60 ? titleCandidate.slice(0, 57).trimEnd() + "..." : titleCandidate;

  const keywordList = uniq(
    [
      primaryKeyword,
      ...trendKeywords,
      ctx.niche,
      ctx.subNiche || "",
      ctx.tone,
      ctx.style,
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase().trim())
  );

  const tags = uniq([
    ...keywordList,
    `${primaryKeyword} explained`,
    `${primaryKeyword} guide`,
    `${primaryKeyword} truth`,
    `${ctx.niche} ${minutes} minutes`,
    `best ${primaryKeyword}`,
    `${primaryKeyword} 2026`,
    `why ${primaryKeyword}`,
    `${primaryKeyword} secrets`,
    "viral video",
    "must watch",
    "deep dive",
    "psychology",
    "mindset",
    "inspiration",
  ]).slice(0, 18);

  const hashtags = uniq(
    [primaryKeyword, ctx.niche, ...(trendKeywords.slice(0, 3))]
      .filter(Boolean)
      .map((s) => "#" + s.toLowerCase().replace(/[^a-z0-9]+/g, ""))
      .filter((h) => h.length > 1)
  ).slice(0, 5);
  while (hashtags.length < 5) hashtags.push(`#video${hashtags.length}`);

  const chapters: ChapterMark[] = buildChapters(script);

  const description = buildDescription({
    concept,
    primaryKeyword,
    hook: script.hook,
    niche: ctx.niche,
    minutes,
    chapters,
    tags,
    hashtags,
  });

  return {
    title,
    description,
    tags,
    hashtags,
    chapters,
    primaryKeyword,
    keywordClusters: [
      uniq([primaryKeyword, `${primaryKeyword} guide`, `${primaryKeyword} explained`, `learn ${primaryKeyword}`]),
      uniq([ctx.niche, `${ctx.niche} tips`, `${ctx.niche} mindset`].filter(Boolean) as string[]),
      uniq(trendKeywords.slice(0, 4).map((k) => k.toLowerCase())),
    ].filter((c) => c.length > 0),
    ctrPrediction: 5.5,
    searchVolume: "MEDIUM",
    thumbnailConcept: `Close-up of a single evocative subject tied to "${concept}". High contrast lighting, shallow depth of field, bold overlay text top-left, expressive face or symbolic object filling 60% of the frame. Color palette tuned to ${ctx.tone || "moody cinematic"} mood.`,
    thumbnailText: capitalize(primaryKeyword).slice(0, 24),
    thumbnailEmotion: "curiosity",
  };
}

function buildChapters(script: GeneratedScript): ChapterMark[] {
  const out: ChapterMark[] = [];
  if (script.sections && script.sections.length > 0) {
    for (const s of script.sections) {
      out.push({ timestamp: secondsToTimestamp(s.startTime || 0), title: s.title || prettyType(s.type) });
    }
  } else {
    const total = Math.max(60, Math.round(script.estimatedDuration || 300));
    const step = Math.max(60, Math.round(total / 5));
    const labels = ["Introduction", "The Setup", "The Turning Point", "The Revelation", "Final Takeaway"];
    for (let i = 0; i < 5; i++) {
      out.push({ timestamp: secondsToTimestamp(i * step), title: labels[i] });
    }
  }
  if (out.length === 0 || out[0].timestamp !== "0:00") {
    out.unshift({ timestamp: "0:00", title: "Introduction" });
  }
  return out;
}

function buildDescription(args: {
  concept: string;
  primaryKeyword: string;
  hook: string;
  niche: string;
  minutes: number;
  chapters: ChapterMark[];
  tags: string[];
  hashtags: string[];
}): string {
  const { concept, primaryKeyword, hook, niche, minutes, chapters, tags, hashtags } = args;
  const opener = hook?.trim() || `In the next ${minutes} minutes, we unpack ${concept}.`;
  const intro = `${opener}

If you've ever wondered about ${primaryKeyword}, this ${minutes}-minute deep dive reframes everything you thought you knew. We connect ${niche} insights with real-world examples so the ideas actually stick.`;

  const value = `📌 What you'll get from this video:
• A clear breakdown of ${primaryKeyword} and why it matters now
• The psychology behind ${concept} — and the patterns most people miss
• Concrete takeaways you can apply today
• A new mental model for thinking about ${niche}`;

  const chaptersBlock = `⏱️ Chapters:
${chapters.map((c) => `${c.timestamp} — ${c.title}`).join("\n")}`;

  const cta = `👉 If this resonated, hit Subscribe and turn on notifications so you don't miss the next one. Drop a comment with your biggest takeaway — we read every reply.

🔁 Share this with one person who needs to hear it today.`;

  const tagsLine = `🏷️ Topics: ${tags.slice(0, 10).join(", ")}`;
  const hashLine = hashtags.join(" ");

  return [intro, value, chaptersBlock, cta, tagsLine, hashLine].join("\n\n");
}

function secondsToTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function prettyType(t: string): string {
  if (!t) return "Section";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter((x) => x !== undefined && x !== null && String(x).length > 0)));
}
