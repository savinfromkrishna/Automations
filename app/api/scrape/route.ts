import { NextResponse } from "next/server";
import { crawlSite } from "@/lib/crawler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const maxPagesParam = searchParams.get("maxPages");
  const detail = searchParams.get("detail") === "1";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const urls = url.split(",").map((u) => u.trim()).filter((u) => u.length > 0);
  const maxPages = Math.max(1, Math.min(60, Number(maxPagesParam) || 30));

  try {
    const results = await Promise.all(
      urls.map(async (target) => {
        try {
          return await crawlSite(target, { maxPages });
        } catch (e: any) {
          return { error: e?.message || "crawl failed", entryUrl: target };
        }
      })
    );

    const ok = results.filter((r: any) => !r.error) as Array<Awaited<ReturnType<typeof crawlSite>>>;
    const combinedText = ok.map((r) => r.combinedText).join("\n\n=== NEXT SOURCE ===\n\n").slice(0, 120000);
    const totalPages = ok.reduce((acc, r) => acc + r.totalPages, 0);
    const totalWords = ok.reduce((acc, r) => acc + r.totalWords, 0);

    if (detail) {
      return NextResponse.json({
        content: combinedText,
        totalPages,
        totalWords,
        sources: results,
      });
    }

    return NextResponse.json({
      content: combinedText,
      totalPages,
      totalWords,
      pageList: ok.flatMap((r) => r.pages.map((p) => ({ url: p.url, title: p.title, words: p.wordCount }))),
    });
  } catch (error: any) {
    console.error("Broad-spectrum scrape failure:", error);
    return NextResponse.json(
      { error: error?.message || "Broad-spectrum scrape failure" },
      { status: 500 }
    );
  }
}
