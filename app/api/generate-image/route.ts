import { NextResponse } from "next/server";
import { generateImage } from "@/lib/media";
import { getModel } from "@/lib/model-catalog";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { prompt, model, width, height, steps, guidance } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    const m = getModel("image", model);
    const out = await generateImage(prompt, m, { width, height, steps, guidance });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "image generation failed" }, { status: 500 });
  }
}
