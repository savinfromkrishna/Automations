import { NextResponse } from "next/server";
import { CATALOG, DEFAULTS } from "@/lib/model-catalog";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ catalog: CATALOG, defaults: DEFAULTS });
}
