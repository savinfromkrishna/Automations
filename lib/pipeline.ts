import { synthesizeContent, cleanJson } from "./synthesize";
import { CrawlResult } from "./crawler";
import { DEFAULTS as MODEL_DEFAULTS } from "./model-catalog";

export const MODELS = {
  extract: MODEL_DEFAULTS.extract,
  write: MODEL_DEFAULTS.write,
  refine: MODEL_DEFAULTS.refine,
} as const;

export interface ModelOverrides {
  extract?: string;
  write?: string;
  refine?: string;
  writeCompare?: string; // optional secondary writer for side-by-side comparison
}

export interface TokenOverrides {
  groqKey?: string;
  hfToken?: string;
}

export interface ExtractionInsights {
  summary: string;
  topics: string[];
  entities: { name: string; type: string }[];
  products: { name: string; description?: string; price?: string }[];
  keyFacts: string[];
  targetKeywords: string[];
  longTailKeywords: string[];
  audienceSignals: string[];
  contentGaps: string[];
  competitivePositioning: string;
  brandVoice: string;
}

export interface PipelineInputs {
  url: string;
  niche: string;
  audience: string;
  tone: string;
  existingPosts?: string;
  tables?: string;
}

export interface PipelineResult {
  insights: ExtractionInsights;
  article: any;
  articleCompare?: any;     // optional second writer's output
  refined: any;
  models: { extract: string; write: string; refine: string; writeCompare?: string };
  meta: { crawledPages: number; crawledWords: number };
}

function tryParse(text: string): any {
  return JSON.parse(cleanJson(text));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function extractInsights(
  crawl: CrawlResult,
  inputs: PipelineInputs,
  modelOverride?: string,
  tokens?: TokenOverrides
): Promise<ExtractionInsights> {
  const pageDigest = crawl.pages
    .slice(0, 25)
    .map((p) => `- ${p.title} (${p.url}) [${p.wordCount}w]\n  desc: ${p.description?.slice(0, 200)}`)
    .join("\n");

  const prompt = `You are a precision content-intelligence extractor. Your job is structured extraction, NOT writing.

SOURCE CONTEXT
Origin: ${crawl.origin}
Entry URL: ${crawl.entryUrl}
Pages crawled: ${crawl.totalPages}
Total words ingested: ${crawl.totalWords}

PAGE INDEX:
${pageDigest}

RAW CORPUS (truncated):
"""
${crawl.combinedText.slice(0, 55000)}
"""

USER INTENT
Niche: ${inputs.niche || "(infer from corpus)"}
Audience: ${inputs.audience || "(infer from corpus)"}
Tone hint: ${inputs.tone}

TASK
Produce a single JSON object with this exact schema. Be specific and grounded in the corpus — no fluff, no placeholders.

{
  "summary": "3-4 sentence executive summary of what this site/topic is about",
  "topics": ["top 8-12 distinct topics covered, ordered by prominence"],
  "entities": [{ "name": "...", "type": "person|product|company|technology|concept|location" }],
  "products": [{ "name": "...", "description": "...", "price": "..." }],
  "keyFacts": ["8-15 concrete factual statements pulled from the corpus, each useful as a quotable data point"],
  "targetKeywords": ["6-10 primary SEO keywords this content should rank for"],
  "longTailKeywords": ["8-15 long-tail keyword phrases"],
  "audienceSignals": ["3-6 signals about who the audience is — pain points, job titles, sophistication level"],
  "contentGaps": ["4-8 angles or questions the existing content does NOT cover — opportunities for a new article"],
  "competitivePositioning": "1-2 sentences on how this site positions itself relative to alternatives",
  "brandVoice": "1-2 sentence description of the tonal voice"
}

Return ONLY the JSON. No prose.`;

  const text = await withRetry(() =>
    synthesizeContent(prompt, modelOverride || MODELS.extract, {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 4096,
      groqKeyOverride: tokens?.groqKey,
      hfTokenOverride: tokens?.hfToken,
    })
  );
  return tryParse(text);
}

export async function writeArticle(
  insights: ExtractionInsights,
  inputs: PipelineInputs,
  modelOverride?: string,
  tokens?: TokenOverrides
): Promise<any> {
  const prompt = `You are a senior long-form content writer. Use the structured insights below to draft a flagship article.

EXTRACTION INSIGHTS:
${JSON.stringify(insights, null, 2)}

USER PARAMETERS:
URL/Context: ${inputs.url}
Niche: ${inputs.niche}
Audience: ${inputs.audience}
Tone: ${inputs.tone}
Existing posts: ${inputs.existingPosts || "(none provided)"}
Database tables: ${inputs.tables || "(none provided)"}

WRITING RULES
- 8-12 sections, each 250-450 words.
- Use the keyFacts and entities — do not invent facts not present in the insights.
- Address at least 3 of the contentGaps explicitly.
- Each section's content_html must use valid HTML: <p>, <ul><li>, <strong>, <em>, <h3> for sub-headings.
- Open with a strong hook that names the audience pain point.
- Include a "products" array if any products were extracted.
- Image prompts must be photographic, specific, and reference the section topic.

Return ONLY this JSON structure, no prose:
{
  "post": {
    "title": "...",
    "slug": "...",
    "meta_description": "...",
    "featured_image_prompt": "Ultra-realistic, high-concept visual representing...",
    "featured_image_url": null,
    "reading_time": "8",
    "created_at": "${new Date().toISOString()}",
    "status": "draft",
    "published_at": null
  },
  "sections": [
    { "heading": "...", "content_html": "...", "order_index": 0 }
  ],
  "images": [
    { "section_heading_ref": "...", "prompt": "Cinematic, detailed photography showing...", "alt_text": "..." }
  ],
  "internal_links": [
    { "anchor_text": "...", "target_slug": "..." }
  ],
  "keywords": [{ "keyword": "..." }],
  "categories": [{ "name": "..." }],
  "products": [{ "name": "...", "price": "$...", "description": "..." }]
}`;

  const text = await withRetry(() =>
    synthesizeContent(prompt, modelOverride || MODELS.write, {
      responseMimeType: "application/json",
      temperature: 0.75,
      maxOutputTokens: 8192,
      groqKeyOverride: tokens?.groqKey,
      hfTokenOverride: tokens?.hfToken,
    })
  );
  return tryParse(text);
}

export async function refineForSeo(article: any, insights: ExtractionInsights, modelOverride?: string, tokens?: TokenOverrides): Promise<any> {
  const prompt = `You are a senior SEO editor. Take this drafted article and refine it for maximum search performance and reader engagement.

DRAFT:
${JSON.stringify(article, null, 2).slice(0, 50000)}

TARGET KEYWORDS (must appear naturally in titles, intro, and at least 3 sections):
${insights.targetKeywords.join(", ")}

LONG-TAIL KEYWORDS (weave into body and H3 sub-headings where natural):
${insights.longTailKeywords.join(", ")}

REFINEMENT REQUIREMENTS
1. Rewrite "meta_description" to 150-160 chars, include the top primary keyword, end with a benefit hook.
2. Rewrite "title" if it's weak — must be under 65 chars, include a primary keyword, and use a high-CTR pattern (number, year, "How to", "Why").
3. For each section: tighten the first sentence into a punchy hook; ensure paragraphs are 2-4 sentences; convert any list-like prose into <ul>; add at least one <strong> per section on the key idea.
4. Rewrite every image alt_text to be descriptive AND keyword-rich.
5. Rewrite internal_link anchor_text to high-CTR phrases (no "click here", no "read more").
6. Add a final section with heading "Frequently Asked Questions" containing 4-6 Q&A in <h3>/<p> pairs targeting long-tail keywords.
7. Ensure keywords array contains all primary + long-tail keywords used.

Return the FULL refined JSON in the same schema. No prose, no commentary.`;

  const text = await withRetry(() =>
    synthesizeContent(prompt, modelOverride || MODELS.refine, {
      responseMimeType: "application/json",
      temperature: 0.45,
      maxOutputTokens: 8192,
      groqKeyOverride: tokens?.groqKey,
      hfTokenOverride: tokens?.hfToken,
    })
  );
  return tryParse(text);
}

export async function runPipeline(
  crawl: CrawlResult,
  inputs: PipelineInputs,
  onProgress?: (stage: "extract" | "write" | "refine", status: "start" | "done") => void,
  overrides: ModelOverrides = {}
): Promise<PipelineResult> {
  const extractModel = overrides.extract || MODELS.extract;
  const writeModel = overrides.write || MODELS.write;
  const refineModel = overrides.refine || MODELS.refine;
  const writeCompareModel = overrides.writeCompare;

  onProgress?.("extract", "start");
  const insights = await extractInsights(crawl, inputs, extractModel);
  onProgress?.("extract", "done");

  onProgress?.("write", "start");
  const writePromises: [Promise<any>, Promise<any> | null] = [
    writeArticle(insights, inputs, writeModel),
    writeCompareModel ? writeArticle(insights, inputs, writeCompareModel).catch((e) => ({ __error: e?.message || "compare failed" })) : null,
  ];
  const article = await writePromises[0];
  const articleCompare = writePromises[1] ? await writePromises[1] : undefined;
  onProgress?.("write", "done");

  onProgress?.("refine", "start");
  let refined = article;
  try {
    refined = await refineForSeo(article, insights, refineModel);
  } catch (e) {
    refined = article;
  }
  onProgress?.("refine", "done");

  return {
    insights,
    article,
    articleCompare,
    refined,
    models: { extract: extractModel, write: writeModel, refine: refineModel, writeCompare: writeCompareModel },
    meta: { crawledPages: crawl.totalPages, crawledWords: crawl.totalWords },
  };
}
