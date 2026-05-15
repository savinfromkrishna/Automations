import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teams = await prisma.team.findMany({
      include: { members: { orderBy: { priority: "asc" } } },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(teams);
  } catch {
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, task_type, is_template, members } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        task_type: task_type || "GENERAL",
        is_template: is_template !== false,
        members: members?.length
          ? {
              create: members.map((m: any, i: number) => ({
                role: m.role,
                model_id: m.model_id,
                model_label: m.model_label,
                instructions: m.instructions || null,
                hf_token: m.hf_token?.trim() || null,
                groq_key: m.groq_key?.trim() || null,
                priority: m.priority ?? i,
                is_active: m.is_active !== false,
              })),
            }
          : undefined,
      },
      include: { members: { orderBy: { priority: "asc" } } },
    });

    return NextResponse.json(team, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
