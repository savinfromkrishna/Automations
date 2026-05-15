import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [hfRow, groqRow] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "hf_api_keys" } }).catch(() => null),
      prisma.systemSetting.findUnique({ where: { key: "groq_keys" } }).catch(() => null),
    ]);
    return NextResponse.json({
      hf_keys: hfRow?.value || "",
      groq_keys: groqRow?.value || "",
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ops: Promise<any>[] = [];

    if (body.hf_keys !== undefined) {
      ops.push(prisma.systemSetting.upsert({
        where: { key: "hf_api_keys" },
        update: { value: body.hf_keys },
        create: { key: "hf_api_keys", value: body.hf_keys },
      }));
    }
    if (body.groq_keys !== undefined) {
      ops.push(prisma.systemSetting.upsert({
        where: { key: "groq_keys" },
        update: { value: body.groq_keys },
        create: { key: "groq_keys", value: body.groq_keys },
      }));
    }

    await Promise.all(ops);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
