import { crawlSite } from "@/lib/crawler";
import { runPipeline, MODELS } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    url, niche = "", audience = "", tone = "Professional & Informative",
    existingPosts = "", tables = "", maxPages = 30,
    models = {} as { extract?: string; write?: string; refine?: string; writeCompare?: string },
  } = body || {};

  if (!url) {
    return new Response(JSON.stringify({ error: "url is required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const effectiveModels = {
          extract: models.extract || MODELS.extract,
          write: models.write || MODELS.write,
          refine: models.refine || MODELS.refine,
          writeCompare: models.writeCompare,
        };
        send("status", { stage: "crawl", status: "start", message: `Crawling ${url}…`, models: effectiveModels });

        const crawl = await crawlSite(url, { maxPages: Math.max(1, Math.min(60, Number(maxPages) || 30)) });

        send("status", {
          stage: "crawl",
          status: "done",
          totalPages: crawl.totalPages,
          totalWords: crawl.totalWords,
          pages: crawl.pages.map((p) => ({ url: p.url, title: p.title, words: p.wordCount })),
          warnings: crawl.warnings,
        });

        const result = await runPipeline(
          crawl,
          { url, niche, audience, tone, existingPosts, tables },
          (stage, status) => {
            send("status", { stage, status, model: effectiveModels[stage as keyof typeof effectiveModels] });
          },
          models
        );

        send("result", result);
        send("done", { ok: true });
      } catch (e: any) {
        send("error", { message: e?.message || "pipeline failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
