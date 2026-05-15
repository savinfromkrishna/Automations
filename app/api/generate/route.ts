import { NextResponse } from "next/server";
import { synthesizeContent, cleanJson } from "@/lib/synthesize";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { prompt, model, config } = await req.json();
    const text = await synthesizeContent(prompt, model, config);

    if (config && config.responseMimeType === "application/json") {
      try {
        const jsonString = cleanJson(text);
        return NextResponse.json({ text: jsonString });
      } catch {
        return NextResponse.json({ text });
      }
    }

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("Neural Synthesis Error:", err);
    return NextResponse.json(
      { error: err.message || "Synthesis failure" },
      { status: 500 }
    );
  }
}
