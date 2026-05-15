import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const { memberId } = await params;
    const body = await req.json();
    const { model_id, model_label, instructions, priority, is_active, hf_token, groq_key } = body;

    const member = await prisma.teamMember.update({
      where: { id: parseInt(memberId) },
      data: {
        ...(model_id !== undefined && { model_id }),
        ...(model_label !== undefined && { model_label }),
        ...(instructions !== undefined && { instructions: instructions || null }),
        ...(hf_token !== undefined && { hf_token: hf_token?.trim() || null }),
        ...(groq_key !== undefined && { groq_key: groq_key?.trim() || null }),
        ...(priority !== undefined && { priority }),
        ...(is_active !== undefined && { is_active }),
      },
    });
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const { memberId } = await params;
    await prisma.teamMember.delete({ where: { id: parseInt(memberId) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete member" }, { status: 500 });
  }
}
