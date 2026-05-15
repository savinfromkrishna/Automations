import { NextResponse } from "next/server";
import { readTokens, writeTokens, maskTokenList, testToken, HfToken } from "@/lib/tokens";

export const runtime = "nodejs";

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function GET() {
  const tokens = await readTokens();
  return NextResponse.json({ tokens: maskTokenList(tokens) });
}

export async function POST(req: Request) {
  const { label, value, test } = await req.json();
  if (!value || typeof value !== "string" || value.trim().length < 8) {
    return NextResponse.json({ error: "token value too short" }, { status: 400 });
  }

  let lastStatus: "ok" | "failed" | "untested" = "untested";
  let lastError: string | undefined;
  let lastTestedAt: string | undefined;
  if (test) {
    const r = await testToken(value.trim());
    lastStatus = r.ok ? "ok" : "failed";
    lastError = r.error;
    lastTestedAt = new Date().toISOString();
  }

  const tokens = await readTokens();
  const next: HfToken = {
    id: newId(),
    label: (label || "").trim() || `Token ${tokens.length + 1}`,
    value: value.trim(),
    addedAt: new Date().toISOString(),
    lastStatus,
    lastError,
    lastTestedAt,
  };
  tokens.push(next);
  await writeTokens(tokens);
  return NextResponse.json({ tokens: maskTokenList(tokens) });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const tokens = await readTokens();
  const filtered = tokens.filter((t) => t.id !== id);
  await writeTokens(filtered);
  return NextResponse.json({ tokens: maskTokenList(filtered) });
}

export async function PATCH(req: Request) {
  const { id, label, action } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const tokens = await readTokens();
  const idx = tokens.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "test") {
    const r = await testToken(tokens[idx].value);
    tokens[idx].lastStatus = r.ok ? "ok" : "failed";
    tokens[idx].lastError = r.error;
    tokens[idx].lastTestedAt = new Date().toISOString();
  }
  if (typeof label === "string") tokens[idx].label = label;

  await writeTokens(tokens);
  return NextResponse.json({ tokens: maskTokenList(tokens) });
}
