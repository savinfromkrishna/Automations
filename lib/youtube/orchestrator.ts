import { prisma } from "../prisma";
import { runTrendIntelligenceAgent } from "./agents/trend-intelligence";
import { runNicheResearchAgent } from "./agents/niche-research";
import { runInsightGeneratorAgent } from "./agents/insight-generator";
import { runMetaphorEngineAgent } from "./agents/metaphor-engine";
import { runScriptwriterAgent } from "./agents/scriptwriter";
import { runStoryboardAgent } from "./agents/storyboard";
import { runVisualGeneratorAgent } from "./agents/visual-generator";
import { runAudioAgent } from "./agents/audio";
import { runSeoGeneratorAgent } from "./agents/seo-generator";
import { runQualityCheckerAgent } from "./agents/quality-checker";
import { storeProjectLearnings } from "./agents/memory-manager";
import { generateImage } from "../media";
import type {
  PipelineContext, NicheBlueprint, InsightSet, MetaphorMap,
  GeneratedScript, GeneratedStoryboard, ScriptSection, EmotionalArcPoint,
  TensionPoint, StoryboardScene, SeoPackage, QualityReport,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE DEFINITIONS — single source of truth for the pipeline graph
// ═══════════════════════════════════════════════════════════════════════════

export type StageId =
  | "TREND_RESEARCH" | "NICHE_RESEARCH" | "INSIGHT_GEN" | "METAPHOR_ENGINE"
  | "SCRIPTWRITER" | "STORYBOARD" | "VISUAL_GENERATION" | "AUDIO_GENERATION"
  | "SEO_OPTIMIZATION" | "QUALITY_CHECK" | "THUMBNAIL_CREATION" | "MEMORY_STORAGE";

export interface StageDef {
  id: StageId;
  label: string;
  agentName: string;
  statusName: string;       // maps to project.status during this stage
  progress: number;          // 0-100
  critical: boolean;         // if false, failures don't abort pipeline
}

export const STAGES: StageDef[] = [
  { id: "TREND_RESEARCH",     label: "Trend Research",    agentName: "TrendIntelligenceAgent", statusName: "RESEARCHING",        progress: 8,   critical: true },
  { id: "NICHE_RESEARCH",     label: "Niche Research",    agentName: "NicheResearchAgent",     statusName: "RESEARCHING",        progress: 18,  critical: true },
  { id: "INSIGHT_GEN",        label: "Insight Generation",agentName: "InsightGeneratorAgent",  statusName: "SCRIPTING",          progress: 28,  critical: true },
  { id: "METAPHOR_ENGINE",    label: "Metaphor Engine",   agentName: "MetaphorEngineAgent",    statusName: "SCRIPTING",          progress: 38,  critical: true },
  { id: "SCRIPTWRITER",       label: "Scriptwriter",      agentName: "ScriptwriterAgent",      statusName: "SCRIPTING",          progress: 50,  critical: true },
  { id: "STORYBOARD",         label: "Storyboard",        agentName: "StoryboardAgent",        statusName: "STORYBOARDING",      progress: 62,  critical: true },
  { id: "VISUAL_GENERATION",  label: "Visual Generation", agentName: "VisualGeneratorAgent",   statusName: "GENERATING_VISUALS", progress: 73,  critical: false },
  { id: "AUDIO_GENERATION",   label: "Audio Generation",  agentName: "AudioAgent",             statusName: "GENERATING_AUDIO",   progress: 80,  critical: false },
  { id: "SEO_OPTIMIZATION",   label: "SEO Optimization",  agentName: "SeoGeneratorAgent",      statusName: "SEO_OPTIMIZATION",   progress: 87,  critical: true },
  { id: "QUALITY_CHECK",      label: "Quality Check",     agentName: "QualityCheckerAgent",    statusName: "QUALITY_CHECK",      progress: 92,  critical: false },
  { id: "THUMBNAIL_CREATION", label: "Thumbnail",         agentName: "ThumbnailAgent",         statusName: "THUMBNAIL_CREATION", progress: 96,  critical: false },
  { id: "MEMORY_STORAGE",     label: "Memory Storage",    agentName: "MemoryAgent",            statusName: "THUMBNAIL_CREATION", progress: 99,  critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════
//  PERSISTENCE HELPERS — each stage can check its own DB completion state
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches the latest SUCCESS agent log for a given agent name on a project.
 * Returns the parsed output JSON, or null if no successful run exists.
 */
async function getLastSuccessOutput<T>(projectId: string, agentName: string): Promise<T | null> {
  const log = await prisma.youtubeAgentLog.findFirst({
    where: { projectId, agentName, status: "SUCCESS" },
    orderBy: { completedAt: "desc" },
  });
  if (!log?.output) return null;
  try {
    return JSON.parse(log.output) as T;
  } catch {
    return null;
  }
}

async function markStageRunning(projectId: string, stage: StageDef) {
  await prisma.youtubeProject.update({
    where: { id: projectId },
    data: { status: stage.statusName, currentStage: stage.id, stageProgress: stage.progress, errorMessage: null },
  });
}

async function createStageLog(projectId: string, stage: StageDef) {
  return prisma.youtubeAgentLog.create({
    data: { projectId, agentName: stage.agentName, stageName: stage.id, status: "RUNNING" },
  });
}

async function completeStageLog(logId: string, output: unknown, durationMs: number, retries: number) {
  await prisma.youtubeAgentLog.update({
    where: { id: logId },
    data: {
      status: "SUCCESS",
      output: output ? JSON.stringify(output).substring(0, 30000) : null,
      duration: durationMs,
      retryCount: retries,
      completedAt: new Date(),
    },
  });
}

async function failStageLog(logId: string, error: string, durationMs: number, retries: number) {
  await prisma.youtubeAgentLog.update({
    where: { id: logId },
    data: {
      status: "FAILED",
      error: error.substring(0, 800),
      duration: durationMs,
      retryCount: retries,
      completedAt: new Date(),
    },
  });
}

/**
 * Runs a stage with retry. On failure, marks the log as FAILED and throws.
 * On success, marks the log as SUCCESS and returns the output.
 */
async function executeStage<T>(
  projectId: string,
  stage: StageDef,
  fn: () => Promise<T>,
  retries = 2
): Promise<T> {
  await markStageRunning(projectId, stage);
  const log = await createStageLog(projectId, stage);
  const t0 = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      await completeStageLog(log.id, result, Date.now() - t0, attempt);
      return result;
    } catch (e: any) {
      if (attempt === retries) {
        await failStageLog(log.id, e.message ?? String(e), Date.now() - t0, attempt);
        throw e;
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE-LEVEL "ALREADY DONE?" CHECKS — read DB to decide if we can skip
// ═══════════════════════════════════════════════════════════════════════════

interface ProjectState {
  concept?: string;
  title?: string;
  trendKeywords: string[];
  nicheBlueprint?: NicheBlueprint;
  insights?: InsightSet;
  metaphors?: MetaphorMap;
  script?: GeneratedScript;
  storyboard?: GeneratedStoryboard;
  scenes?: Array<{ id: string; sceneNumber: number; visualPrompt: string; environment?: string | null; metaphorElement?: string | null }>;
  seo?: SeoPackage;
  qualityReport?: QualityReport;
}

async function hydrateState(projectId: string): Promise<ProjectState> {
  const state: ProjectState = { trendKeywords: [] };

  // Project basics
  const project = await prisma.youtubeProject.findUnique({ where: { id: projectId } });
  if (project) {
    state.concept = project.concept ?? undefined;
    state.title = project.title ?? undefined;
  }

  // TREND_RESEARCH → from agent log
  const trendOutput = await getLastSuccessOutput<{ ideas: Array<{ keywords: string[]; opportunityScore: number; concept: string; title: string }> }>(projectId, "TrendIntelligenceAgent");
  if (trendOutput?.ideas?.length) {
    const best = [...trendOutput.ideas].sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
    state.trendKeywords = best.keywords || [];
  }

  // NICHE_RESEARCH → from agent log
  state.nicheBlueprint = await getLastSuccessOutput<NicheBlueprint>(projectId, "NicheResearchAgent") ?? undefined;

  // INSIGHT_GEN → from agent log
  state.insights = await getLastSuccessOutput<InsightSet>(projectId, "InsightGeneratorAgent") ?? undefined;

  // METAPHOR_ENGINE → from agent log
  state.metaphors = await getLastSuccessOutput<MetaphorMap>(projectId, "MetaphorEngineAgent") ?? undefined;

  // SCRIPT → from DB
  const dbScript = await prisma.youtubeScript.findUnique({ where: { projectId } });
  if (dbScript) {
    state.script = {
      hook: dbScript.hook,
      hookType: dbScript.hookType ?? "statement",
      fullScript: dbScript.fullScript,
      sections: safeParse<ScriptSection[]>(dbScript.sections) ?? [],
      wordCount: dbScript.wordCount ?? 0,
      estimatedDuration: dbScript.estimatedDuration ?? 0,
      emotionalArc: safeParse<EmotionalArcPoint[]>(dbScript.emotionalArc) ?? [],
      tensionPoints: safeParse<TensionPoint[]>(dbScript.tensionPoints) ?? [],
      retentionScore: dbScript.retentionScore ?? 0,
      emotionScore: dbScript.emotionScore ?? 0,
      originalityScore: dbScript.originalityScore ?? 0,
    };
  }

  // STORYBOARD + SCENES → from DB
  const dbStoryboard = await prisma.youtubeStoryboard.findUnique({
    where: { projectId },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } },
  });
  if (dbStoryboard) {
    state.storyboard = {
      totalScenes: dbStoryboard.totalScenes,
      totalDuration: dbStoryboard.totalDuration,
      visualStyle: dbStoryboard.visualStyle ?? "",
      colorGrading: dbStoryboard.colorGrading ?? "",
      motionStyle: dbStoryboard.motionStyle ?? "",
      transitionStyle: dbStoryboard.transitionStyle ?? "",
      paceNotes: dbStoryboard.paceNotes ?? "",
      scenes: dbStoryboard.scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        type: s.type as any,
        scriptText: s.scriptText,
        visualPrompt: s.visualPrompt,
        duration: s.duration,
        startTime: s.startTime,
        cameraDirection: s.cameraDirection ?? "",
        lightingNotes: s.lightingNotes ?? "",
        transition: s.transition ?? "",
        environment: s.environment ?? "",
        metaphorElement: s.metaphorElement ?? "",
        emotionalBeat: s.emotionalBeat ?? "",
      })),
    };
    state.scenes = dbStoryboard.scenes.map(s => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      visualPrompt: s.visualPrompt,
      environment: s.environment,
      metaphorElement: s.metaphorElement,
    }));
  }

  // SEO → from DB
  const dbSeo = await prisma.youtubeSeo.findUnique({ where: { projectId } });
  if (dbSeo) {
    state.seo = {
      title: dbSeo.title,
      description: dbSeo.description,
      tags: safeParse<string[]>(dbSeo.tags) ?? [],
      hashtags: safeParse<string[]>(dbSeo.hashtags) ?? [],
      chapters: safeParse<any[]>(dbSeo.chapters ?? "[]") ?? [],
      primaryKeyword: dbSeo.primaryKeyword ?? "",
      keywordClusters: safeParse<string[][]>(dbSeo.keywordClusters ?? "[]") ?? [],
      ctrPrediction: dbSeo.ctrPrediction ?? 0,
      searchVolume: dbSeo.searchVolume ?? "MEDIUM",
      thumbnailConcept: dbSeo.thumbnailConcept ?? "",
      thumbnailText: dbSeo.thumbnailText ?? "",
      thumbnailEmotion: dbSeo.thumbnailEmotion ?? "",
    };
  }

  // QUALITY → from agent log
  state.qualityReport = await getLastSuccessOutput<QualityReport>(projectId, "QualityCheckerAgent") ?? undefined;

  return state;
}

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

// Check if a stage's output already exists in state.
function isStageDone(stageId: StageId, state: ProjectState): boolean {
  switch (stageId) {
    case "TREND_RESEARCH":     return Boolean(state.concept && state.title);
    case "NICHE_RESEARCH":     return Boolean(state.nicheBlueprint);
    case "INSIGHT_GEN":        return Boolean(state.insights);
    case "METAPHOR_ENGINE":    return Boolean(state.metaphors);
    case "SCRIPTWRITER":       return Boolean(state.script);
    case "STORYBOARD":         return Boolean(state.storyboard && state.storyboard.scenes.length > 0);
    case "VISUAL_GENERATION":  return false; // re-evaluated dynamically based on scene image coverage
    case "AUDIO_GENERATION":   return false; // re-evaluated dynamically based on AUDIO_NARRATION asset existence
    case "SEO_OPTIMIZATION":   return Boolean(state.seo);
    case "QUALITY_CHECK":      return Boolean(state.qualityReport);
    case "THUMBNAIL_CREATION": return false; // re-evaluated based on THUMBNAIL asset existence
    case "MEMORY_STORAGE":     return false; // memory is additive — re-run on retry is fine but harmless
    default:                   return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN PIPELINE — fully resumable
// ═══════════════════════════════════════════════════════════════════════════

export async function runYoutubeProjectPipeline(projectId: string, opts: { startFromStage?: StageId } = {}): Promise<void> {
  const project = await prisma.youtubeProject.findUnique({
    where: { id: projectId },
    include: { channel: true },
  });
  if (!project?.channel) throw new Error(`Project ${projectId} not found`);

  const channel = project.channel;
  const ctx: PipelineContext = {
    channelId: channel.id,
    projectId,
    niche: channel.niche,
    subNiche: channel.subNiche ?? undefined,
    tone: channel.tone,
    style: channel.style,
    targetAudience: channel.targetAudience ?? undefined,
    brandVoice: channel.brandVoice ?? undefined,
    visualStyle: channel.visualStyle ?? undefined,
    preferredDuration: channel.preferredDuration,
    memories: [],
  };

  // Hydrate everything already completed from the DB.
  const state = await hydrateState(projectId);

  // If user requested re-run from a specific stage, invalidate downstream state.
  if (opts.startFromStage) {
    invalidateFromStage(state, opts.startFromStage);
    await clearDownstreamArtifacts(projectId, opts.startFromStage);
  }

  console.log(`[Orchestrator] Project ${projectId} resuming. Already-done: ${STAGES.filter(s => isStageDone(s.id, state)).map(s => s.id).join(", ") || "none"}`);

  try {
    // ── STAGE 1: TREND_RESEARCH ─────────────────────────────────────────────
    if (!isStageDone("TREND_RESEARCH", state)) {
      const stage = STAGES.find(s => s.id === "TREND_RESEARCH")!;
      const trendOutput = await executeStage(projectId, stage, () => runTrendIntelligenceAgent(ctx));

      const bestIdea = [...trendOutput.ideas].sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
      state.concept = state.concept || bestIdea.concept;
      state.title = state.title || bestIdea.title;
      state.trendKeywords = bestIdea.keywords;

      await prisma.youtubeProject.update({
        where: { id: projectId },
        data: {
          concept: state.concept,
          title: state.title,
          trendScore: bestIdea.trendScore,
          viralityScore: bestIdea.viralityScore,
          competitionScore: bestIdea.competitionScore,
        },
      });

      for (const idea of trendOutput.ideas) {
        await prisma.youtubeIdea.create({
          data: {
            channelId: channel.id, title: idea.title, concept: idea.concept,
            hook: idea.hook, emotionalAngle: idea.emotionalAngle,
            targetEmotion: idea.targetEmotion, metaphorSeed: idea.metaphorSeed,
            trendScore: idea.trendScore, viralityScore: idea.viralityScore,
            competitionScore: idea.competitionScore, opportunityScore: idea.opportunityScore,
            keywords: JSON.stringify(idea.keywords), sourceSignals: idea.sourceSignals,
            status: "NEW",
          },
        }).catch(() => {/* dupes ok */});
      }
    } else {
      console.log("[Orchestrator] SKIP TREND_RESEARCH (already done)");
    }

    const concept = state.concept!;

    // ── STAGE 2: NICHE_RESEARCH ─────────────────────────────────────────────
    if (!isStageDone("NICHE_RESEARCH", state)) {
      const stage = STAGES.find(s => s.id === "NICHE_RESEARCH")!;
      state.nicheBlueprint = await executeStage(projectId, stage, () => runNicheResearchAgent(ctx, concept));
    } else {
      console.log("[Orchestrator] SKIP NICHE_RESEARCH (already done)");
    }

    // ── STAGE 3: INSIGHT_GEN ───────────────────────────────────────────────
    if (!isStageDone("INSIGHT_GEN", state)) {
      const stage = STAGES.find(s => s.id === "INSIGHT_GEN")!;
      state.insights = await executeStage(projectId, stage, () => runInsightGeneratorAgent(ctx, concept, state.nicheBlueprint!));
    } else {
      console.log("[Orchestrator] SKIP INSIGHT_GEN (already done)");
    }

    // ── STAGE 4: METAPHOR_ENGINE ───────────────────────────────────────────
    if (!isStageDone("METAPHOR_ENGINE", state)) {
      const stage = STAGES.find(s => s.id === "METAPHOR_ENGINE")!;
      const seedIdea = await prisma.youtubeIdea.findFirst({
        where: { channelId: channel.id, status: "NEW" },
        orderBy: { opportunityScore: "desc" },
      });
      state.metaphors = await executeStage(projectId, stage, () =>
        runMetaphorEngineAgent(ctx, concept, state.insights!, seedIdea?.metaphorSeed ?? undefined)
      );
    } else {
      console.log("[Orchestrator] SKIP METAPHOR_ENGINE (already done)");
    }

    // ── STAGE 5: SCRIPTWRITER ──────────────────────────────────────────────
    if (!isStageDone("SCRIPTWRITER", state)) {
      const stage = STAGES.find(s => s.id === "SCRIPTWRITER")!;
      const script = await executeStage(projectId, stage, () =>
        runScriptwriterAgent(ctx, concept, state.insights!, state.metaphors!, state.nicheBlueprint!)
      );

      await prisma.youtubeScript.upsert({
        where: { projectId },
        create: {
          projectId, hook: script.hook, hookType: script.hookType ?? "statement",
          fullScript: script.fullScript, sections: JSON.stringify(script.sections),
          wordCount: script.wordCount, estimatedDuration: script.estimatedDuration,
          emotionalArc: JSON.stringify(script.emotionalArc),
          tensionPoints: JSON.stringify(script.tensionPoints),
          retentionScore: script.retentionScore, emotionScore: script.emotionScore,
          originalityScore: script.originalityScore,
        },
        update: {
          hook: script.hook, hookType: script.hookType ?? "statement",
          fullScript: script.fullScript, sections: JSON.stringify(script.sections),
          wordCount: script.wordCount, estimatedDuration: script.estimatedDuration,
          emotionalArc: JSON.stringify(script.emotionalArc),
          tensionPoints: JSON.stringify(script.tensionPoints),
          retentionScore: script.retentionScore, emotionScore: script.emotionScore,
          originalityScore: script.originalityScore, version: { increment: 1 },
        },
      });
      state.script = script;
    } else {
      console.log("[Orchestrator] SKIP SCRIPTWRITER (already done)");
    }

    // ── STAGE 6: STORYBOARD ────────────────────────────────────────────────
    if (!isStageDone("STORYBOARD", state)) {
      const stage = STAGES.find(s => s.id === "STORYBOARD")!;
      const storyboard = await executeStage(projectId, stage, () =>
        runStoryboardAgent(ctx, state.script!, state.metaphors!)
      );

      // Remove any stale storyboard/scenes from a prior partial run
      await prisma.youtubeScene.deleteMany({ where: { projectId } });
      await prisma.youtubeStoryboard.deleteMany({ where: { projectId } });

      const savedSb = await prisma.youtubeStoryboard.create({
        data: {
          projectId, totalScenes: storyboard.totalScenes, totalDuration: storyboard.totalDuration,
          visualStyle: storyboard.visualStyle, colorGrading: storyboard.colorGrading,
          motionStyle: storyboard.motionStyle, transitionStyle: storyboard.transitionStyle,
          paceNotes: storyboard.paceNotes,
        },
      });

      state.scenes = [];
      for (const scene of storyboard.scenes) {
        const saved = await prisma.youtubeScene.create({
          data: {
            projectId, storyboardId: savedSb.id,
            sceneNumber: scene.sceneNumber, type: scene.type,
            scriptText: scene.scriptText, visualPrompt: scene.visualPrompt,
            duration: scene.duration, startTime: scene.startTime,
            cameraDirection: scene.cameraDirection, lightingNotes: scene.lightingNotes,
            transition: scene.transition, environment: scene.environment,
            metaphorElement: scene.metaphorElement, emotionalBeat: scene.emotionalBeat,
            status: "PENDING",
          },
        });
        state.scenes.push({
          id: saved.id, sceneNumber: saved.sceneNumber, visualPrompt: saved.visualPrompt,
          environment: saved.environment, metaphorElement: saved.metaphorElement,
        });
      }
      state.storyboard = storyboard;
    } else {
      console.log("[Orchestrator] SKIP STORYBOARD (already done)");
    }

    // ── STAGE 7: VISUAL_GENERATION (per-scene resumable) ───────────────────
    const allScenes = await prisma.youtubeScene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
    const pendingScenes = allScenes.filter(s => !s.imageUrl);
    if (pendingScenes.length > 0) {
      const stage = STAGES.find(s => s.id === "VISUAL_GENERATION")!;
      try {
        await executeStage(projectId, stage, () =>
          runVisualGeneratorAgent(projectId, pendingScenes.map(s => ({
            id: s.id, sceneNumber: s.sceneNumber, visualPrompt: s.visualPrompt,
            environment: s.environment, metaphorElement: s.metaphorElement,
          })))
        );
      } catch (e: any) {
        console.warn("[Orchestrator] Visual generation partial failure:", e.message);
        // Non-critical — continue. Per-scene state is preserved via scene.imageUrl on DB.
      }
    } else {
      console.log("[Orchestrator] SKIP VISUAL_GENERATION (all scenes have images)");
    }

    // ── STAGE 8: AUDIO_GENERATION ──────────────────────────────────────────
    const existingNarration = await prisma.youtubeAsset.findFirst({
      where: { projectId, type: "AUDIO_NARRATION" },
    });
    if (!existingNarration) {
      const stage = STAGES.find(s => s.id === "AUDIO_GENERATION")!;
      try {
        const emotionalArcDesc = state.script!.emotionalArc
          .map(p => `${p.timePercent}%: ${p.emotion} (intensity ${p.intensity})`).join(" → ");
        await executeStage(projectId, stage, () => runAudioAgent(projectId, state.script!, emotionalArcDesc));
      } catch (e: any) {
        console.warn("[Orchestrator] Audio failed:", e.message);
      }
    } else {
      console.log("[Orchestrator] SKIP AUDIO_GENERATION (narration exists)");
    }

    // ── STAGE 9: SEO_OPTIMIZATION ──────────────────────────────────────────
    if (!isStageDone("SEO_OPTIMIZATION", state)) {
      const stage = STAGES.find(s => s.id === "SEO_OPTIMIZATION")!;
      const seo = await executeStage(projectId, stage, () =>
        runSeoGeneratorAgent(ctx, concept, state.script!, state.trendKeywords)
      );

      await prisma.youtubeSeo.upsert({
        where: { projectId },
        create: {
          projectId, title: seo.title, description: seo.description,
          tags: JSON.stringify(seo.tags), hashtags: JSON.stringify(seo.hashtags),
          chapters: JSON.stringify(seo.chapters), primaryKeyword: seo.primaryKeyword,
          keywordClusters: JSON.stringify(seo.keywordClusters),
          ctrPrediction: seo.ctrPrediction, searchVolume: seo.searchVolume,
          thumbnailConcept: seo.thumbnailConcept, thumbnailText: seo.thumbnailText,
          thumbnailEmotion: seo.thumbnailEmotion,
        },
        update: {
          title: seo.title, description: seo.description,
          tags: JSON.stringify(seo.tags), hashtags: JSON.stringify(seo.hashtags),
          chapters: JSON.stringify(seo.chapters), primaryKeyword: seo.primaryKeyword,
          keywordClusters: JSON.stringify(seo.keywordClusters),
          ctrPrediction: seo.ctrPrediction, searchVolume: seo.searchVolume,
          thumbnailConcept: seo.thumbnailConcept, thumbnailText: seo.thumbnailText,
          thumbnailEmotion: seo.thumbnailEmotion,
        },
      });

      await prisma.youtubeProject.update({ where: { id: projectId }, data: { title: seo.title } });
      state.seo = seo;
    } else {
      console.log("[Orchestrator] SKIP SEO_OPTIMIZATION (already done)");
    }

    // ── STAGE 10: QUALITY_CHECK ────────────────────────────────────────────
    if (!isStageDone("QUALITY_CHECK", state)) {
      const stage = STAGES.find(s => s.id === "QUALITY_CHECK")!;
      const sceneCount = await prisma.youtubeScene.count({ where: { projectId } });
      const assetCount = await prisma.youtubeAsset.count({ where: { projectId } });
      try {
        state.qualityReport = await executeStage(projectId, stage, () =>
          runQualityCheckerAgent(state.script!, state.seo!, sceneCount, assetCount)
        );
      } catch (e: any) {
        console.warn("[Orchestrator] Quality check failed:", e.message);
      }
    } else {
      console.log("[Orchestrator] SKIP QUALITY_CHECK (already done)");
    }

    // ── STAGE 11: THUMBNAIL_CREATION ───────────────────────────────────────
    const existingThumb = await prisma.youtubeAsset.findFirst({ where: { projectId, type: "THUMBNAIL" } });
    if (!existingThumb && state.seo) {
      const stage = STAGES.find(s => s.id === "THUMBNAIL_CREATION")!;
      try {
        await executeStage(projectId, stage, async () => {
          const thumbPrompt = `${state.seo!.thumbnailConcept}, ${state.seo!.thumbnailEmotion} expression, YouTube thumbnail style, high contrast, bold composition, 4K, professional photography`;
          const thumbResult = await generateImage(thumbPrompt, "black-forest-labs/FLUX.1-dev", { width: 1280, height: 720 });
          await prisma.youtubeAsset.create({
            data: {
              projectId, type: "THUMBNAIL", url: thumbResult.url, prompt: thumbPrompt,
              width: 1280, height: 720, provider: thumbResult.provider, model: thumbResult.model,
              qualityScore: 0.9,
            },
          });
          await prisma.youtubeProject.update({ where: { id: projectId }, data: { thumbnailUrl: thumbResult.url } });
          return { url: thumbResult.url };
        });
      } catch (e: any) {
        console.warn("[Orchestrator] Thumbnail failed:", e.message);
      }
    } else {
      console.log("[Orchestrator] SKIP THUMBNAIL_CREATION");
    }

    // ── STAGE 12: MEMORY_STORAGE ───────────────────────────────────────────
    if (state.script && state.seo && state.qualityReport) {
      const stage = STAGES.find(s => s.id === "MEMORY_STORAGE")!;
      try {
        await executeStage(projectId, stage, async () => {
          await storeProjectLearnings(channel.id, projectId, state.script!, state.seo!, state.qualityReport!);
          return { stored: true };
        });
      } catch (e: any) {
        console.warn("[Orchestrator] Memory storage failed:", e.message);
      }
    }

    // ── DONE ───────────────────────────────────────────────────────────────
    await prisma.youtubeProject.update({
      where: { id: projectId },
      data: { status: "READY_TO_PUBLISH", currentStage: "READY_TO_PUBLISH", stageProgress: 100, errorMessage: null },
    });
    console.log(`[Orchestrator] Project ${projectId} completed.`);
  } catch (err: any) {
    console.error(`[Orchestrator] Project ${projectId} FAILED:`, err.message);
    await prisma.youtubeProject.update({
      where: { id: projectId },
      data: { status: "FAILED", errorMessage: (err.message ?? "Unknown error").substring(0, 500) },
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE INVALIDATION — for "re-run from this stage onwards" requests
// ═══════════════════════════════════════════════════════════════════════════

function invalidateFromStage(state: ProjectState, fromStage: StageId) {
  const idx = STAGES.findIndex(s => s.id === fromStage);
  if (idx < 0) return;
  for (let i = idx; i < STAGES.length; i++) {
    const id = STAGES[i].id;
    switch (id) {
      case "NICHE_RESEARCH":     state.nicheBlueprint = undefined; break;
      case "INSIGHT_GEN":        state.insights = undefined; break;
      case "METAPHOR_ENGINE":    state.metaphors = undefined; break;
      case "SCRIPTWRITER":       state.script = undefined; break;
      case "STORYBOARD":         state.storyboard = undefined; state.scenes = undefined; break;
      case "SEO_OPTIMIZATION":   state.seo = undefined; break;
      case "QUALITY_CHECK":      state.qualityReport = undefined; break;
    }
  }
}

async function clearDownstreamArtifacts(projectId: string, fromStage: StageId): Promise<void> {
  const idx = STAGES.findIndex(s => s.id === fromStage);
  if (idx < 0) return;
  const stagesToClear = STAGES.slice(idx).map(s => s.id);

  // Delete agent logs for invalidated stages so the resume check sees them as "not done"
  await prisma.youtubeAgentLog.deleteMany({
    where: { projectId, stageName: { in: stagesToClear } },
  });

  // Delete downstream DB records
  if (stagesToClear.includes("SCRIPTWRITER")) {
    await prisma.youtubeScript.deleteMany({ where: { projectId } });
  }
  if (stagesToClear.includes("STORYBOARD")) {
    await prisma.youtubeScene.deleteMany({ where: { projectId } });
    await prisma.youtubeStoryboard.deleteMany({ where: { projectId } });
  }
  if (stagesToClear.includes("VISUAL_GENERATION")) {
    await prisma.youtubeAsset.deleteMany({ where: { projectId, type: "IMAGE" } });
    await prisma.youtubeScene.updateMany({ where: { projectId }, data: { imageUrl: null, status: "PENDING" } });
  }
  if (stagesToClear.includes("AUDIO_GENERATION")) {
    await prisma.youtubeAsset.deleteMany({ where: { projectId, type: { in: ["AUDIO_NARRATION", "AUDIO_MUSIC", "AUDIO_SFX"] } } });
  }
  if (stagesToClear.includes("SEO_OPTIMIZATION")) {
    await prisma.youtubeSeo.deleteMany({ where: { projectId } });
  }
  if (stagesToClear.includes("THUMBNAIL_CREATION")) {
    await prisma.youtubeAsset.deleteMany({ where: { projectId, type: "THUMBNAIL" } });
    await prisma.youtubeProject.update({ where: { id: projectId }, data: { thumbnailUrl: null } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export async function createProjectFromIdea(
  channelId: string,
  idea: Partial<{ concept: string; title: string }>
): Promise<string> {
  const project = await prisma.youtubeProject.create({
    data: { channelId, concept: idea.concept, title: idea.title, status: "IDEA", priority: 5 },
  });
  return project.id;
}

/**
 * Returns the workflow graph for a project: each stage with its current status.
 * Used by the workflow UI to render the pipeline visualization.
 */
export async function getProjectWorkflowState(projectId: string): Promise<Array<{
  stage: StageDef;
  status: "idle" | "running" | "done" | "error" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount?: number;
}>> {
  const project = await prisma.youtubeProject.findUnique({ where: { id: projectId } });
  if (!project) return [];

  const logs = await prisma.youtubeAgentLog.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
  });

  // Map: stageName -> latest log
  const latestByStage = new Map<string, typeof logs[number]>();
  for (const log of logs) {
    if (!latestByStage.has(log.stageName)) latestByStage.set(log.stageName, log);
  }

  return STAGES.map(stage => {
    const log = latestByStage.get(stage.id);
    let status: "idle" | "running" | "done" | "error" | "skipped" = "idle";
    if (log) {
      if (log.status === "SUCCESS") status = "done";
      else if (log.status === "FAILED") status = "error";
      else if (log.status === "RUNNING") status = "running";
    }
    // Override: if current project status matches this stage's statusName and it's running
    if (project.currentStage === stage.id && project.status !== "FAILED" && project.status !== "READY_TO_PUBLISH" && project.status !== "PUBLISHED") {
      status = "running";
    }
    return {
      stage,
      status,
      startedAt: log?.startedAt,
      completedAt: log?.completedAt ?? undefined,
      error: log?.error ?? undefined,
      retryCount: log?.retryCount ?? undefined,
    };
  });
}
