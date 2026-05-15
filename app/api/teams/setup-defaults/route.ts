import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Default team templates for the canvas workflow.
// Each team is identified by its name so we don't duplicate on re-runs.
const DEFAULT_TEAMS = [
  {
    name: "Extraction Team",
    description: "3 parallel workers — each processes a different page chunk simultaneously",
    task_type: "DATA_EXTRACTION",
    members: [
      { role: "worker_1", model_id: "Qwen/Qwen2.5-72B-Instruct",               model_label: "Qwen 2.5 · 72B",     priority: 0 },
      { role: "worker_2", model_id: "meta-llama/Llama-3.3-70B-Instruct",        model_label: "Llama 3.3 · 70B",    priority: 1 },
      { role: "worker_3", model_id: "deepseek-ai/DeepSeek-V3",                  model_label: "DeepSeek V3",         priority: 2 },
    ],
  },
  {
    name: "Writing Team",
    description: "2-model chain — first model drafts, second model expands and enriches",
    task_type: "CONTENT_WRITING",
    members: [
      { role: "worker_1", model_id: "meta-llama/Llama-3.3-70B-Instruct",        model_label: "Llama 3.3 · 70B",    priority: 0 },
      { role: "worker_2", model_id: "deepseek-ai/DeepSeek-V3",                  model_label: "DeepSeek V3",         priority: 1 },
    ],
  },
  {
    name: "Refinement Team",
    description: "2-model chain — first model refines SEO, second model polishes tone and readability",
    task_type: "SEO",
    members: [
      { role: "worker_1", model_id: "deepseek-ai/DeepSeek-V3",                  model_label: "DeepSeek V3",         priority: 0 },
      { role: "worker_2", model_id: "Qwen/Qwen2.5-72B-Instruct",                model_label: "Qwen 2.5 · 72B",     priority: 1 },
    ],
  },
  {
    name: "Image Team",
    description: "3-model first-win — tries FLUX → SDXL → SD1.5, each with its own HF token. Add a dedicated HF token per worker to spread credit usage across accounts.",
    task_type: "IMAGE_GENERATION",
    members: [
      { role: "worker_1", model_id: "black-forest-labs/FLUX.1-schnell",         model_label: "FLUX.1 Schnell",      priority: 0 },
      { role: "worker_2", model_id: "stabilityai/stable-diffusion-xl-base-1.0", model_label: "SDXL Base 1.0",       priority: 1 },
      { role: "worker_3", model_id: "runwayml/stable-diffusion-v1-5",           model_label: "Stable Diffusion 1.5",priority: 2 },
    ],
  },
  {
    name: "Video Team",
    description: "2-model first-win — tries Wan2.2 → Mochi, each with its own HF token. Add a dedicated HF token per worker to spread credit usage across accounts.",
    task_type: "VIDEO_GENERATION",
    members: [
      { role: "worker_1", model_id: "Wan-AI/Wan2.2-T2V-A14B",                  model_label: "Wan2.2 T2V 14B",     priority: 0 },
      { role: "worker_2", model_id: "genmo/mochi-1-preview",                    model_label: "Mochi 1 Preview",     priority: 1 },
    ],
  },
];

export async function POST() {
  try {
    const result: { created: any[]; existing: any[] } = { created: [], existing: [] };

    for (const tmpl of DEFAULT_TEAMS) {
      // Check if a team with this name already exists
      const existing = await prisma.team.findFirst({
        where: { name: tmpl.name },
        include: { members: { orderBy: { priority: "asc" } } },
      });

      if (existing) {
        result.existing.push(existing);
        continue;
      }

      const team = await prisma.team.create({
        data: {
          name: tmpl.name,
          description: tmpl.description,
          task_type: tmpl.task_type,
          is_template: true,
          members: {
            create: tmpl.members.map((m) => ({
              role: m.role,
              model_id: m.model_id,
              model_label: m.model_label,
              priority: m.priority,
              is_active: true,
            })),
          },
        },
        include: { members: { orderBy: { priority: "asc" } } },
      });

      result.created.push(team);
    }

    // Return all teams (created + existing) in stable order
    const allTeams = await prisma.team.findMany({
      where: { name: { in: DEFAULT_TEAMS.map((t) => t.name) } },
      include: { members: { orderBy: { priority: "asc" } } },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({
      teams: allTeams,
      created: result.created.length,
      existing: result.existing.length,
    });
  } catch (e: any) {
    console.error("[setup-defaults]", e?.message);
    return NextResponse.json({ error: e?.message || "Failed to set up default teams" }, { status: 500 });
  }
}
