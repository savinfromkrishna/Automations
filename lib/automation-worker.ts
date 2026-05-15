import { prisma } from "./prisma";
import { synthesizeContent, cleanJson, DEFAULT_HF_MODEL, listValidHfKeys } from "./synthesize";
import { savePostToDb } from "./save-post";
import { DEFAULTS as MODEL_DEFAULTS } from "./model-catalog";

function buildTeamModels(members: Array<{ role: string; model_id: string; is_active: boolean }>) {
  const map: Record<string, string> = {};
  for (const m of members) {
    if (m.is_active) map[m.role] = m.model_id;
  }
  return map;
}

export async function runAutoGeneration() {
  console.log("[Worker] Checking for pending automation tasks...");
  const now = new Date();
  const currentDay = now.getDay();

  const tasks = await prisma.automationTask.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ next_run: null }, { next_run: { lte: now } }],
    },
    include: {
      team: { include: { members: { where: { is_active: true } } } },
    },
  });

  if (tasks.length === 0) {
    console.log("[Worker] No tasks to process.");
    return;
  }

  const tokens = await listValidHfKeys();
  if (tokens.length === 0) {
    console.warn(
      `[Worker] ${tasks.length} task(s) ready but no HF_TOKEN configured. Add one to .env or Settings → Hugging Face Token Pool. Skipping cycle.`
    );
    return;
  }

  for (const task of tasks) {
    try {
      if (task.days_of_week) {
        const allowedDays = task.days_of_week.split(",").map((d) => parseInt(d.trim()));
        if (!allowedDays.includes(currentDay)) {
          console.log(
            `[Worker] Task ${task.id} skipped - day ${currentDay} not in allowed days (${task.days_of_week})`
          );
          const newNextRun = new Date(now);
          newNextRun.setHours(newNextRun.getHours() + 1);
          await prisma.automationTask.update({
            where: { id: task.id },
            data: { next_run: newNextRun },
          });
          continue;
        }
      }

      const teamModels = task.team ? buildTeamModels(task.team.members) : {};
      const teamLabel = task.team ? ` [Team: ${task.team.name}]` : "";
      console.log(`[Worker] Executing task for niche: ${task.niche}${teamLabel}`);

      const extractModel = teamModels["extract"] || MODEL_DEFAULTS.extract;
      const writeModel   = teamModels["write"]   || MODEL_DEFAULTS.write;
      const refineModel  = teamModels["refine"]  || MODEL_DEFAULTS.refine;

      const prompt = `
        You are a world-class content architect. Perform a "Deep Scan" synthesis.
        Niche: ${task.niche}
        Audience: ${task.audience}
        Tone: ${task.tone}
        Products: ${task.products}

        Return a JSON object:
        {
          "post": { "title": "...", "slug": "...", "meta_description": "...", "featured_image_prompt": "...", "reading_time": "7" },
          "sections": [ { "heading": "...", "content_html": "...", "order_index": 0 } ],
          "images": [ { "section_heading_ref": "...", "prompt": "...", "alt_text": "..." } ],
          "internal_links": [ { "anchor_text": "...", "target_slug": "..." } ],
          "keywords": [ { "keyword": "..." } ],
          "categories": [ { "name": "..." } ],
          "products": [ { "name": "...", "price": "$...", "description": "..." } ]
        }
      `;

      // Stage 1 — extract/plan using team's extract model
      const extractText = await synthesizeContent(prompt, extractModel, {
        responseMimeType: "application/json",
      });
      const generation = JSON.parse(cleanJson(extractText));

      // Stage 2 — optional write refinement using team's write model (if different from extract)
      if (writeModel !== extractModel && generation.sections?.length) {
        const writePrompt = `You are an expert content writer with the tone: "${task.tone}".
Rewrite and enrich the sections below for the audience: "${task.audience}".
Keep the same JSON structure. Make each section more detailed, engaging, and SEO-rich.
Current JSON:
${JSON.stringify({ post: generation.post, sections: generation.sections }, null, 2).slice(0, 40000)}
Return ONLY valid JSON with the same structure.`;
        try {
          const writeText = await synthesizeContent(writePrompt, writeModel, {
            responseMimeType: "application/json",
          });
          const written = JSON.parse(cleanJson(writeText));
          if (written.sections?.length) {
            generation.sections = written.sections;
            if (written.post?.title) generation.post = { ...generation.post, ...written.post };
          }
        } catch (e) {
          console.warn("[Worker] Write stage failed, using extract output:", e);
        }
      }

      // Stage 3 — SEO refine using team's refine model
      if (refineModel !== writeModel) {
        const refinePrompt = `You are an SEO expert. Polish the article JSON below for maximum search performance.
Optimize: title, meta_description, headings, keyword density, and content_html clarity.
Niche: ${task.niche} | Audience: ${task.audience}
Article JSON:
${JSON.stringify({ post: generation.post, sections: generation.sections }, null, 2).slice(0, 40000)}
Return ONLY the improved JSON with same structure.`;
        try {
          const refineText = await synthesizeContent(refinePrompt, refineModel, {
            responseMimeType: "application/json",
          });
          const refined = JSON.parse(cleanJson(refineText));
          if (refined.sections?.length) {
            generation.sections = refined.sections;
            if (refined.post?.title) generation.post = { ...generation.post, ...refined.post };
          }
        } catch (e) {
          console.warn("[Worker] Refine stage failed, using write output:", e);
        }
      }

      console.log(`[Worker] Pipeline complete — extract:${extractModel} | write:${writeModel} | refine:${refineModel}`);

      if (task.publication_lead_time_hours > 0) {
        const publishedAt = new Date(
          now.getTime() + task.publication_lead_time_hours * 60 * 60 * 1000
        );
        generation.post.published_at = publishedAt.toISOString();
        generation.post.status = "scheduled";
      }

      await savePostToDb(generation);

      let nextRun: Date;
      if (task.schedule_type === "DAILY" && task.schedule_time) {
        const [hours, minutes] = task.schedule_time.split(":").map(Number);
        nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
      } else {
        const intervalHours = task.interval_hours || 24 / (task.posts_per_day || 2);
        nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
      }

      if (task.generation_buffer_minutes > 0) {
        const minNextRun = new Date(now.getTime() + task.generation_buffer_minutes * 60 * 1000);
        if (nextRun < minNextRun) nextRun = minNextRun;
      }

      if (task.days_of_week) {
        const allowedDays = task.days_of_week.split(",").map((d) => parseInt(d.trim()));
        let safetyCounter = 0;
        while (!allowedDays.includes(nextRun.getDay()) && safetyCounter < 10) {
          nextRun.setDate(nextRun.getDate() + 1);
          safetyCounter++;
        }
      }

      await prisma.automationTask.update({
        where: { id: task.id },
        data: { last_run: now, next_run: nextRun },
      });
    } catch (err) {
      console.error(`[Worker] Task ${task.id} failed:`, err);
    }
  }
}

let started = false;
export function startAutomationWorker() {
  if (started) return;
  started = true;
  console.log("[NeuralNexus] Automation Engine standby... (Starting in 10s)");
  setTimeout(() => {
    console.log("[NeuralNexus] Automation Engine Initialized");
    setInterval(() => {
      runAutoGeneration().catch((e) => console.error("[Worker] cycle error", e));
    }, 5 * 60 * 1000);
    runAutoGeneration().catch((e) => console.error("[Worker] initial cycle error", e));
  }, 10000);
}
