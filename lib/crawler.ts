import * as cheerio from "cheerio";

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  ogImage: string;
  headings: { level: number; text: string }[];
  content: string;
  wordCount: number;
  links: string[];
}

export interface CrawlResult {
  origin: string;
  entryUrl: string;
  pages: CrawledPage[];
  totalPages: number;
  totalWords: number;
  combinedText: string;
  discoveredFrom: { sitemap: number; onPage: number };
  warnings: string[];
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_PAGES = 30;
const CONCURRENCY = 6;

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    return resp;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = "";
    // strip common tracking params
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "gclid", "fbclid"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return null;
  }
}

function isHtmlUrl(u: string): boolean {
  const lower = u.toLowerCase();
  const blocked = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".mp4", ".mp3", ".zip", ".rar", ".css", ".js", ".xml", ".json", ".ico"];
  if (blocked.some((ext) => lower.endsWith(ext))) return false;
  if (lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("javascript:")) return false;
  return true;
}

async function fetchSitemap(origin: string): Promise<string[]> {
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/wp-sitemap.xml`,
  ];

  const found = new Set<string>();
  for (const sm of candidates) {
    const resp = await fetchWithTimeout(sm, 8000);
    if (!resp || !resp.ok) continue;
    const xml = await resp.text();

    const subSitemaps = Array.from(xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)).map(
      (m) => m[1].trim()
    );
    if (subSitemaps.length > 0) {
      for (const sub of subSitemaps.slice(0, 5)) {
        const subResp = await fetchWithTimeout(sub, 8000);
        if (!subResp || !subResp.ok) continue;
        const subXml = await subResp.text();
        const subLocs = Array.from(subXml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)).map((m) =>
          m[1].trim()
        );
        subLocs.forEach((l) => found.add(l));
        if (found.size > 200) break;
      }
    } else {
      const locs = Array.from(xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)).map((m) =>
        m[1].trim()
      );
      locs.forEach((l) => found.add(l));
    }

    if (found.size > 0) break;
  }

  return Array.from(found);
}

function extractPage(url: string, html: string): CrawledPage {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "";

  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() || "";

  // collect outbound links BEFORE we strip nav
  const rawLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) rawLinks.push(href);
  });
  const links = rawLinks
    .map((h) => normalizeUrl(h, url))
    .filter((u): u is string => !!u && isHtmlUrl(u));

  // strip chrome/junk
  $(
    'script, style, noscript, iframe, nav, footer, header, aside, form, .ads, #ads, .sidebar, #sidebar, .menu, .nav, .footer, .header, .advertisement, [role="complementary"], [role="navigation"], [role="banner"], [role="contentinfo"], .newsletter, .social-share, .comments, .related-posts, .popup, .modal, .cookie-banner, .gdpr'
  ).remove();

  const headingSelectors: Record<number, string> = { 1: "h1", 2: "h2", 3: "h3" };
  const headings: { level: number; text: string }[] = [];
  for (const [level, sel] of Object.entries(headingSelectors)) {
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t && t.length < 220) headings.push({ level: Number(level), text: t });
    });
  }

  const candidates = [
    "main article",
    "article",
    "main",
    ".post-content",
    ".article-content",
    ".entry-content",
    "#content",
    ".content",
    ".main-content",
    ".article-body",
    ".post-body",
    '[itemprop="articleBody"]',
    ".prose",
  ];
  let root = $("");
  for (const sel of candidates) {
    const found = $(sel).first();
    if (found.length > 0 && found.text().trim().length > 200) {
      root = found;
      break;
    }
  }
  if (root.length === 0) root = $("body");

  const content = root
    .find("p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, td")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length > 0)
    .join("\n")
    .slice(0, 12000);

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return { url, title, description, ogImage, headings, content, wordCount, links: Array.from(new Set(links)) };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function crawlSite(
  entryUrl: string,
  opts: { maxPages?: number } = {}
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const warnings: string[] = [];

  let parsed: URL;
  try {
    parsed = new URL(entryUrl);
  } catch {
    throw new Error(`Invalid URL: ${entryUrl}`);
  }
  const origin = parsed.origin;

  // 1. entry page
  const entryResp = await fetchWithTimeout(entryUrl);
  if (!entryResp || !entryResp.ok) {
    throw new Error(`Failed to fetch entry URL (status ${entryResp?.status ?? "no response"})`);
  }
  const entryHtml = await entryResp.text();
  const entryPage = extractPage(entryUrl, entryHtml);

  // 2. discover via sitemap + entry page links
  const [sitemapUrls] = await Promise.all([fetchSitemap(origin).catch(() => [] as string[])]);
  const onPageUrls = entryPage.links.filter((u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  });

  if (sitemapUrls.length === 0) warnings.push("No sitemap discovered; relying on on-page links only.");

  const candidates = new Set<string>();
  candidates.add(entryUrl);
  for (const u of sitemapUrls) {
    try {
      if (new URL(u).origin === origin) candidates.add(u);
    } catch {}
    if (candidates.size >= maxPages) break;
  }
  if (candidates.size < maxPages) {
    for (const u of onPageUrls) {
      candidates.add(u);
      if (candidates.size >= maxPages) break;
    }
  }

  const urlList = Array.from(candidates).slice(0, maxPages);
  const sitemapHits = urlList.filter((u) => sitemapUrls.includes(u)).length;

  // 3. fetch all in parallel (entry already fetched)
  const pages = await mapWithConcurrency(urlList, CONCURRENCY, async (u) => {
    if (u === entryUrl) return entryPage;
    const r = await fetchWithTimeout(u);
    if (!r || !r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await r.text();
    try {
      return extractPage(u, html);
    } catch {
      return null;
    }
  });

  const valid = pages.filter((p): p is CrawledPage => p !== null && p.content.length > 50);
  const totalWords = valid.reduce((acc, p) => acc + p.wordCount, 0);

  const combinedText = valid
    .map((p) => {
      const head = `# ${p.title || p.url}\nURL: ${p.url}\nDescription: ${p.description}`;
      const heads = p.headings
        .slice(0, 12)
        .map((h) => `${"#".repeat(h.level + 1)} ${h.text}`)
        .join("\n");
      return `${head}\n${heads}\n\n${p.content}`;
    })
    .join("\n\n--- NEXT PAGE ---\n\n")
    .slice(0, 80000);

  return {
    origin,
    entryUrl,
    pages: valid,
    totalPages: valid.length,
    totalWords,
    combinedText,
    discoveredFrom: { sitemap: sitemapHits, onPage: urlList.length - sitemapHits },
    warnings,
  };
}
