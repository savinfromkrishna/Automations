import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runExtract, runWrite, runRefine } from "@/lib/stage-runners";
import { generateImage, generateVideo } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 300;

function dedupeBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  return arr.filter((item) => {
    const k = (item as any)[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeInsights(results: any[]): any {
  if (results.length === 1) return results[0];
  return {
    summary: results.map((r) => r.summary).filter(Boolean).join(" Additionally, "),
    topics: [...new Set(results.flatMap((r) => r.topics || []))],
    entities: dedupeBy(results.flatMap((r) => r.entities || []), "name"),
    products: dedupeBy(results.flatMap((r) => r.products || []), "name"),
    keyFacts: [...new Set(results.flatMap((r) => r.keyFacts || []))],
    targetKeywords: [...new Set(results.flatMap((r) => r.targetKeywords || []))].slice(0, 40),
    longTailKeywords: [...new Set(results.flatMap((r) => r.longTailKeywords || []))].slice(0, 40),
    audienceSignals: [...new Set(results.flatMap((r) => r.audienceSignals || []))],
    contentGaps: [...new Set(results.flatMap((r) => r.contentGaps || []))],
    competitivePositioning: results.find((r) => r.competitivePositioning)?.competitivePositioning || "",
    brandVoice: results.find((r) => r.brandVoice)?.brandVoice || "",
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { stage, ...stageBody } = body;

    if (!stage) return NextResponse.json({ error: "stage required" }, { status: 400 });

    const team = await prisma.team.findUnique({
      where: { id: parseInt(id) },
      include: {
        members: { where: { is_active: true }, orderBy: { priority: "asc" } },
      },
    });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const members = team.members;
    if (members.length === 0) {
      return NextResponse.json({ error: "Team has no active members" }, { status: 400 });
    }

    // ── EXTRACT: split crawl pages across members, run in parallel, merge ────
    if (stage === "extract") {
      const crawl = stageBody.crawl;
      if (!crawl?.pages?.length) throw new Error("No crawl pages provided");

      const pages = crawl.pages;
      const chunkSize = Math.ceil(pages.length / members.length);

      const tasks = members.map((member, i) => {
        const chunkPages = pages.slice(i * chunkSize, (i + 1) * chunkSize);
        if (chunkPages.length === 0) return Promise.resolve(null);
        const chunkCrawl = {
          ...crawl,
          pages: chunkPages,
          totalPages: chunkPages.length,
          totalWords: chunkPages.reduce((s: number, p: any) => s + (p.wordCount || 0), 0),
          combinedText: chunkPages.map((p: any) => p.content || "").join("\n\n"),
        };
        console.log(`[Team ${team.id}] Extract member ${i + 1}/${members.length} · ${chunkPages.length} pages · ${member.model_id}`);
        return runExtract({
          crawl: chunkCrawl,
          niche: stageBody.niche,
          audience: stageBody.audience,
          tone: stageBody.tone,
          existingPosts: stageBody.existingPosts,
          model: member.model_id,
          hfToken: member.hf_token || undefined,
          groqKey: member.groq_key || undefined,
        });
      });

      const settled = await Promise.allSettled(tasks);
      const successful = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
        .map((r) => r.value);

      if (successful.length === 0) {
        const errors = settled
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => r.reason?.message || "unknown");
        throw new Error(`All team members failed: ${errors.slice(0, 3).join("; ")}`);
      }

      const merged = mergeInsights(successful);
      console.log(`[Team ${team.id}] Extract merged: ${successful.length}/${members.length} members, ${(merged.topics||[]).length} topics`);

      return NextResponse.json({
        ...merged,
        _teamMeta: {
          teamId: team.id,
          teamName: team.name,
          mode: "parallel-chunks",
          membersRan: successful.length,
          totalMembers: members.length,
          pagesPerMember: chunkSize,
          models: members.map((m) => m.model_id),
        },
      });
    }

    // ── WRITE: sequential chain — each model improves on the previous draft ──
    if (stage === "write") {
      let current: any = null;
      const modelsUsed: string[] = [];

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        modelsUsed.push(member.model_id);
        console.log(`[Team ${team.id}] Write chain ${i + 1}/${members.length} · ${member.model_id}`);
        try {
          const opts: any = {
            ...stageBody,
            model: member.model_id,
            hfToken: member.hf_token || undefined,
            groqKey: member.groq_key || undefined,
          };
          if (current !== null && i > 0) {
            opts.existingPosts = [
              stageBody.existingPosts || "",
              `\n\n[Previous draft — improve upon this]:\n${JSON.stringify(
                { post: current.post, sections: current.sections }, null, 2
              ).slice(0, 8000)}`,
            ].join("");
          }
          current = await runWrite(opts);
        } catch (e: any) {
          console.warn(`[Team ${team.id}] Write member ${i + 1} failed: ${e.message}`);
          if (current === null) throw e;
        }
      }

      return NextResponse.json({
        ...current,
        _teamMeta: {
          teamId: team.id,
          teamName: team.name,
          mode: "sequential-chain",
          modelsUsed,
        },
      });
    }

    // ── REFINE: sequential chain — each model polishes further ───────────────
    if (stage === "refine") {
      let current = stageBody.article;
      const modelsUsed: string[] = [];

      for (const member of members) {
        modelsUsed.push(member.model_id);
        console.log(`[Team ${team.id}] Refine chain · ${member.model_id}`);
        try {
          current = await runRefine({
            article: current,
            insights: stageBody.insights,
            model: member.model_id,
            hfToken: member.hf_token || undefined,
            groqKey: member.groq_key || undefined,
          });
        } catch (e: any) {
          console.warn(`[Team ${team.id}] Refine member (${member.model_id}) failed: ${e.message}`);
          // Keep previous output and continue the chain
        }
      }

      return NextResponse.json({
        ...current,
        _teamMeta: {
          teamId: team.id,
          teamName: team.name,
          mode: "sequential-chain",
          modelsUsed,
        },
      });
    }

    // ── IMAGE: first-win across members — each tries its own token/model ────────
    if (stage === "image") {
      const { prompt, model: fallbackModel, width, height, steps, guidance } = stageBody;
      const errors: string[] = [];

      for (const member of members) {
        const useModel = member.model_id || fallbackModel;
        console.log(`[Team ${team.id}] Image ${member.role} · ${useModel}`);
        try {
          const result = await generateImage(prompt, useModel, {
            width, height, steps, guidance,
            hfToken: member.hf_token || undefined,
          });
          return NextResponse.json({
            ...result,
            _teamMeta: {
              teamId: team.id,
              teamName: team.name,
              mode: "first-win",
              memberUsed: member.role,
              modelUsed: useModel,
            },
          });
        } catch (e: any) {
          errors.push(`[${member.role}/${useModel}] ${e.message?.slice(0, 200)}`);
        }
      }

      // All members failed — soft-fail so the pipeline continues
      return NextResponse.json({
        skipped: true,
        reason: "all_members_failed",
        message: `Image team: all workers failed. ${errors.join(" | ")}`,
      });
    }

    // ── VIDEO: first-win across members — each tries its own token/model ────────
    if (stage === "video") {
      const { prompt, model: fallbackModel, numFrames, fps, image } = stageBody;
      const errors: string[] = [];

      for (const member of members) {
        const useModel = member.model_id || fallbackModel;
        console.log(`[Team ${team.id}] Video ${member.role} · ${useModel}`);
        try {
          const result = await generateVideo(prompt, useModel, {
            numFrames, fps, image,
            hfToken: member.hf_token || undefined,
          });
          return NextResponse.json({
            ...result,
            _teamMeta: {
              teamId: team.id,
              teamName: team.name,
              mode: "first-win",
              memberUsed: member.role,
              modelUsed: useModel,
            },
          });
        } catch (e: any) {
          errors.push(`[${member.role}/${useModel}] ${e.message?.slice(0, 200)}`);
        }
      }

      return NextResponse.json({
        skipped: true,
        reason: "all_members_failed",
        message: `Video team: all workers failed. ${errors.join(" | ")}`,
      });
    }

    return NextResponse.json(
      { error: `Team execution not supported for stage: ${stage}. Supported: extract, write, refine, image, video.` },
      { status: 400 }
    );
  } catch (e: any) {
    const msg = e?.message || "Team execution failed";
    console.error("[Team Execute]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
