import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { savePostToDb } from "@/lib/save-post";

export const runtime = "nodejs";

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      include: { categories: true, products: true, sections: true, images: true },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(posts);
  } catch {
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const createdPost = await savePostToDb(body);
    return NextResponse.json(createdPost, { status: 201 });
  } catch (error) {
    console.error("Database save error:", error);
    return NextResponse.json(
      { error: "Failed to save to database" },
      { status: 500 }
    );
  }
}
