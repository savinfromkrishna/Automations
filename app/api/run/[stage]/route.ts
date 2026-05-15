import { NextResponse } from "next/server";
import { generateImage, generateVideo } from "@/lib/media";
import { runCrawl, runExtract, runWrite, runRefine, runFaq, runSchema, runSocial, runTranslate, runSummarize, runTts, runPublish } from "@/lib/stage-runners";

export const runtime = "nodejs";
export const maxDuration = 300;

type Stage =
  | "crawl" | "extract" | "write" | "refine"
  | "image" | "video" | "tts"
  | "faq" | "schema" | "social" | "translate" | "summarize" | "publish";

export async function POST(req: Request, { params }: { params: Promise<{ stage: string }> }) {
  const { stage: rawStage } = await params;
  const stage = rawStage as Stage;
  let body: any = {};
  try { body = await req.json(); } catch {}

  const MEDIA_STAGES = new Set(["image", "video", "tts"]);

  try {
    let out: any;
    switch (stage) {
      case "crawl":     out = await runCrawl(body); break;
      case "extract":   out = await runExtract(body); break;
      case "write":     out = await runWrite(body); break;
      case "refine":    out = await runRefine(body); break;
      case "image":     out = await generateImage(body.prompt, body.model, body); break;
      case "video":     out = await generateVideo(body.prompt, body.model, body); break;
      case "tts":       out = await runTts(body); break;
      case "faq":       out = await runFaq(body); break;
      case "schema":    out = runSchema(body); break;
      case "social":    out = await runSocial(body); break;
      case "translate": out = await runTranslate(body); break;
      case "summarize": out = await runSummarize(body); break;
      case "publish":   out = await runPublish(body); break;
      default:
        return NextResponse.json({ error: `unknown stage: ${rawStage}` }, { status: 400 });
    }
    return NextResponse.json(out);
  } catch (e: any) {
    const msg: string = e?.message || "stage failed";
    console.error(`[run/${rawStage}]`, msg);
    // Media stages (image/video/tts) soft-fail — return skipped so the pipeline can continue
    if (MEDIA_STAGES.has(stage) && msg.startsWith("CREDITS_DEPLETED:")) {
      return NextResponse.json({ skipped: true, reason: "credits_depleted", message: msg.replace("CREDITS_DEPLETED: ", "") });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
