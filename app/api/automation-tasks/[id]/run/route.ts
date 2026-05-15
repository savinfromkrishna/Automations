import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { synthesizeContent, cleanJson, DEFAULT_HF_MODEL } from "@/lib/synthesize";
import { savePostToDb } from "@/lib/save-post";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await prisma.automationTask.findUnique({
      where: { id: parseInt(id) },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    console.log(`[Manual Trigger] Executing task: ${task.niche}`);

    const prompt = `
      You are a world-class content architect. Perform a "Deep Scan" synthesis.
      Niche: ${task.niche}
      Audience: ${task.audience}
      Tone: ${task.tone}
      Products: ${task.products}

      Return a JSON object:
      {
        "post": { "title": "...", "slug": "...", "meta_description": "...", "featured_image_prompt": "...", "reading_time": "7" },
        "sections": [ { "heading": "...", "content_html": "...", "order_index": 0 } ],
        "images": [ { "section_heading_ref": "...", "prompt": "...", "alt_text": "..." } ],
        "internal_links": [ { "anchor_text": "...", "target_slug": "..." } ],
        "keywords": [ { "keyword": "..." } ],
        "categories": [ { "name": "..." } ],
        "products": [ { "name": "...", "price": "$...", "description": "..." } ]
      }
    `;

    const text = await synthesizeContent(prompt, DEFAULT_HF_MODEL, {
      responseMimeType: "application/json",
    });

    const generation = JSON.parse(cleanJson(text));
    await savePostToDb(generation);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const msg: string = err?.message || "Failed to execute task manually";
    console.error("[Manual Trigger] Error:", msg);
    const isCredits = msg.includes("CREDITS_DEPLETED") || msg.includes("depleted") || msg.includes("402");
    return NextResponse.json({ error: msg }, { status: isCredits ? 402 : 500 });
  }
}
