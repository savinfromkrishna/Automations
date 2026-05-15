import { NextResponse } from "next/server";
import { runYoutubeWorker } from "../../../../lib/youtube/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    await runYoutubeWorker();
    return NextResponse.json({ success: true, message: "YouTube worker cycle completed" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "YouTube worker endpoint ready. POST to trigger." });
}
