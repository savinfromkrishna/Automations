import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const members = await prisma.teamMember.findMany({
      where: { team_id: parseInt(id) },
      orderBy: { priority: "asc" },
    });
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { role, model_id, model_label, instructions, priority, is_active, hf_token, groq_key } = body;

    if (!role || !model_id || !model_label) {
      return NextResponse.json({ error: "role, model_id, and model_label are required" }, { status: 400 });
    }

    // Upsert: replace if same role already exists in this team
    const member = await prisma.teamMember.upsert({
      where: { team_id_role: { team_id: parseInt(id), role } },
      update: {
        model_id,
        model_label,
        instructions: instructions || null,
        hf_token: hf_token?.trim() || null,
        groq_key: groq_key?.trim() || null,
        priority: priority ?? 0,
        is_active: is_active !== false,
      },
      create: {
        team_id: parseInt(id),
        role,
        model_id,
        model_label,
        instructions: instructions || null,
        hf_token: hf_token?.trim() || null,
        groq_key: groq_key?.trim() || null,
        priority: priority ?? 0,
        is_active: is_active !== false,
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
