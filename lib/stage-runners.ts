import { synthesizeContent, cleanJson } from "./synthesize";
import { crawlSite, CrawlResult } from "./crawler";
import { extractInsights, writeArticle, refineForSeo } from "./pipeline";
import { DEFAULTS as MODEL_DEFAULTS } from "./model-catalog";
import { savePostToDb } from "./save-post";
import { generateTts } from "./media";

interface TokenOpts { hfToken?: string; groqKey?: string; }

function tryParse(text: string): any {
  return JSON.parse(cleanJson(text));
}

/* ====== CRAWL ====== */
export async function runCrawl(opts: { url: string; maxPages?: number }) {
  if (!opts.url) throw new Error("url required");
  const crawl = await crawlSite(opts.url, { maxPages: Math.max(1, Math.min(60, opts.maxPages || 30)) });
  return {
    origin: crawl.origin,
    entryUrl: crawl.entryUrl,
    totalPages: crawl.totalPages,
    totalWords: crawl.totalWords,
    pages: crawl.pages.map((p) => ({ url: p.url, title: p.title, words: p.wordCount })),
    full: crawl,
  };
}

/* ====== EXTRACT ====== */
export async function runExtract(opts: { crawl: CrawlResult; niche?: string; audience?: string; tone?: string; existingPosts?: string; tables?: string; model?: string } & TokenOpts) {
  if (!opts.crawl) throw new Error("crawl input required");
  return await extractInsights(opts.crawl, {
    url: opts.crawl.entryUrl,
    niche: opts.niche || "",
    audience: opts.audience || "",
    tone: opts.tone || "Professional & Informative",
    existingPosts: opts.existingPosts || "",
    tables: opts.tables || "",
  }, opts.model, { groqKey: opts.groqKey, hfToken: opts.hfToken });
}

/* ====== WRITE ====== */
export async function runWrite(opts: { insights: any; url?: string; niche?: string; audience?: string; tone?: string; existingPosts?: string; tables?: string; model?: string } & TokenOpts) {
  if (!opts.insights) throw new Error("insights input required");
  return await writeArticle(opts.insights, {
    url: opts.url || "",
    niche: opts.niche || "",
    audience: opts.audience || "",
    tone: opts.tone || "Professional & Informative",
    existingPosts: opts.existingPosts || "",
    tables: opts.tables || "",
  }, opts.model, { groqKey: opts.groqKey, hfToken: opts.hfToken });
}

/* ====== REFINE ====== */
export async function runRefine(opts: { article: any; insights: any; model?: string } & TokenOpts) {
  if (!opts.article || !opts.insights) throw new Error("article and insights required");
  return await refineForSeo(opts.article, opts.insights, opts.model, { groqKey: opts.groqKey, hfToken: opts.hfToken });
}

/* ====== FAQ GENERATOR ====== */
export async function runFaq(opts: { article: any; insights?: any; count?: number; model?: string }) {
  const count = opts.count || 6;
  const keywords = opts.insights?.longTailKeywords?.join(", ") || "";
  const prompt = `You are an SEO expert. Generate ${count} high-value FAQ items for this article.

ARTICLE TITLE: ${opts.article?.post?.title || ""}
META DESCRIPTION: ${opts.article?.post?.meta_description || ""}
SECTIONS: ${(opts.article?.sections || []).map((s: any) => s.heading).join("; ")}
LONG-TAIL KEYWORDS TO TARGET: ${keywords}

Return ONLY this JSON:
{
  "faqs": [
    { "question": "...", "answer_html": "<p>...</p>" }
  ]
}

Rules:
- Each answer 60-120 words, in valid HTML <p>/<ul>/<li>.
- Questions should match real Google "People Also Ask" phrasing.
- Cover different angles: beginner, comparison, pricing/time, best-practice, troubleshooting.`;
  const text = await synthesizeContent(prompt, opts.model || MODEL_DEFAULTS.refine, {
    responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 4096,
  });
  return tryParse(text);
}

/* ====== SCHEMA / JSON-LD ====== */
export function runSchema(opts: { article: any; siteName?: string; authorName?: string }) {
  const post = opts.article?.post;
  if (!post) throw new Error("article.post required");
  const headline = post.title;
  const description = post.meta_description;
  const datePublished = post.published_at || post.created_at || new Date().toISOString();
  const sections = (opts.article.sections || []).map((s: any) => ({ "@type": "WebPageElement", name: s.heading }));
  const faqs = (opts.article.faqs?.faqs || opts.article.faqs || []) as Array<{ question: string; answer_html: string }>;

  const jsonld: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline,
      description,
      datePublished,
      author: { "@type": "Person", name: opts.authorName || "Content Architect" },
      publisher: { "@type": "Organization", name: opts.siteName || "Content Architect" },
      image: post.featured_image_url || undefined,
      keywords: (opts.article.keywords || []).map((k: any) => k.keyword).join(", "),
      hasPart: sections,
    },
  ];

  if (Array.isArray(faqs) && faqs.length > 0) {
    jsonld.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() },
      })),
    });
  }

  return { jsonld, asString: JSON.stringify(jsonld, null, 2) };
}

/* ====== SOCIAL ====== */
export async function runSocial(opts: { article: any; platforms?: Array<"twitter" | "linkedin" | "instagram">; model?: string }) {
  const platforms = opts.platforms || ["twitter", "linkedin"];
  const prompt = `You are a senior social-media editor. Convert the article below into platform-specific posts.

TITLE: ${opts.article?.post?.title}
META: ${opts.article?.post?.meta_description}
SECTIONS: ${(opts.article?.sections || []).map((s: any) => s.heading).join("; ")}
KEYWORDS: ${(opts.article?.keywords || []).map((k: any) => k.keyword).join(", ")}

Return ONLY this JSON, with entries ONLY for these platforms: ${platforms.join(", ")}
{
  "twitter": { "thread": ["tweet 1 ≤ 270 chars", "tweet 2 ≤ 270 chars", "..."], "hashtags": ["#..."] },
  "linkedin": { "post": "350-500 word LinkedIn post in markdown", "hashtags": ["#..."] },
  "instagram": { "caption": "150-220 word IG caption", "hashtags": ["#..."] }
}

Rules:
- No emoji unless platform-native (IG/Twitter allow tasteful use).
- Twitter thread 5-9 tweets, hook-first.
- LinkedIn post must end with a sharp question to drive comments.`;
  const text = await synthesizeContent(prompt, opts.model || MODEL_DEFAULTS.write, {
    responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 3000,
  });
  return tryParse(text);
}

/* ====== TRANSLATE ====== */
export async function runTranslate(opts: { article: any; targetLang: string; model?: string }) {
  if (!opts.article) throw new Error("article required");
  if (!opts.targetLang) throw new Error("targetLang required");
  const prompt = `Translate this article to ${opts.targetLang}. Preserve HTML tags exactly. Keep the JSON structure identical, only translate string values.

ARTICLE JSON:
${JSON.stringify(opts.article, null, 2).slice(0, 50000)}

Return ONLY the translated JSON in the same schema. Do NOT translate URLs, slugs, schema field names, or HTML tag names.`;
  const text = await synthesizeContent(prompt, opts.model || MODEL_DEFAULTS.write, {
    responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 8192,
  });
  return tryParse(text);
}

/* ====== SUMMARIZE / TL;DR ====== */
export async function runSummarize(opts: { article: any; words?: number; model?: string }) {
  const target = opts.words || 80;
  const sectionsText = (opts.article?.sections || []).map((s: any) => `${s.heading}\n${(s.content_html || "").replace(/<[^>]+>/g, " ")}`).join("\n\n").slice(0, 30000);
  const prompt = `Summarize the article below in exactly ${target} words. Plain prose, no bullet points, no preamble.

TITLE: ${opts.article?.post?.title}
BODY:
${sectionsText}

Return ONLY this JSON:
{ "tldr": "..." }`;
  const text = await synthesizeContent(prompt, opts.model || MODEL_DEFAULTS.refine, {
    responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 1000,
  });
  return tryParse(text);
}

/* ====== TTS / AUDIO NARRATION ====== */
export async function runTts(opts: { text?: string; article?: any; model?: string; maxChars?: number }) {
  const inputText =
    opts.text ||
    (opts.article?.post?.title
      ? `${opts.article.post.title}. ${opts.article.post.meta_description || ""}. ${(opts.article.sections || []).map((s: any) => `${s.heading}. ${(s.content_html || "").replace(/<[^>]+>/g, " ")}`).join(" ")}`
      : "");
  if (!inputText.trim()) throw new Error("text or article required");
  const text = inputText.slice(0, opts.maxChars || 1500);
  const model = opts.model || "facebook/mms-tts-eng";
  return await generateTts(text, model);
}

/* ====== PUBLISH ====== */
export async function runPublish(opts: { article: any; status?: "draft" | "published" }) {
  if (!opts.article) throw new Error("article required");
  const article = JSON.parse(JSON.stringify(opts.article));
  if (opts.status) {
    article.post = { ...article.post, status: opts.status };
    if (opts.status === "published" && !article.post.published_at) article.post.published_at = new Date().toISOString();
  }
  return await savePostToDb(article);
}
