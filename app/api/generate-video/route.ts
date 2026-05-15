import { NextResponse } from "next/server";
import { generateVideo } from "@/lib/media";
import { getModel } from "@/lib/model-catalog";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { prompt, model, numFrames, fps } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    const m = getModel("video", model);
    const out = await generateVideo(prompt, m, { numFrames, fps });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "video generation failed" }, { status: 500 });
  }
}
