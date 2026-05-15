import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const task = await prisma.automationTask.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.team_id !== undefined && { team_id: body.team_id ? parseInt(body.team_id) : null }),
        ...(body.niche !== undefined && { niche: body.niche }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.products !== undefined && { products: body.products }),
        ...(body.audience !== undefined && { audience: body.audience }),
        ...(body.tone !== undefined && { tone: body.tone }),
      },
      include: {
        team: { include: { members: { orderBy: { priority: "asc" } } } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.automationTask.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
