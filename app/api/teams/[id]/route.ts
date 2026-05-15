import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const team = await prisma.team.findUnique({
      where: { id: parseInt(id) },
      include: {
        members: { orderBy: { priority: "asc" } },
        tasks: { select: { id: true, niche: true, category: true, status: true } },
      },
    });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    return NextResponse.json(team);
  } catch {
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, task_type, is_template } = body;

    const team = await prisma.team.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(task_type !== undefined && { task_type }),
        ...(is_template !== undefined && { is_template }),
      },
      include: { members: { orderBy: { priority: "asc" } } },
    });
    return NextResponse.json(team);
  } catch {
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Unlink any tasks pointing to this team first
    await prisma.automationTask.updateMany({
      where: { team_id: parseInt(id) },
      data: { team_id: null },
    });
    await prisma.team.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
