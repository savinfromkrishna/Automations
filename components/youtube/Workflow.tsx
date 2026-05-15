"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  Node,
  Edge,
  MarkerType,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Loader2, Check, AlertTriangle, MinusCircle, X, RefreshCw, Play,
  Search, Brain, Sparkles, Wand2, PenTool, Layers, Image as ImageIcon,
  Mic, Target, ShieldCheck, Camera, Database, ChevronRight, Activity,
  Shield, Key, Zap,
} from "lucide-react";

// ─── Stage metadata ───────────────────────────────────────────────────────────
interface StageMeta { color: string; bg: string; ring: string; icon: React.ReactNode; tagline: string }

const STAGE_META: Record<string, StageMeta> = {
  TREND_RESEARCH:     { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  ring: "rgba(96,165,250,0.4)",  icon: <Search className="w-4 h-4" />,    tagline: "Find viral opportunities" },
  NICHE_RESEARCH:     { color: "#22d3ee", bg: "rgba(34,211,238,0.12)",  ring: "rgba(34,211,238,0.4)",  icon: <Brain className="w-4 h-4" />,     tagline: "Audience psychology blueprint" },
  INSIGHT_GEN:        { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", ring: "rgba(167,139,250,0.4)", icon: <Sparkles className="w-4 h-4" />,  tagline: "Original perspectives" },
  METAPHOR_ENGINE:    { color: "#f472b6", bg: "rgba(244,114,182,0.12)", ring: "rgba(244,114,182,0.4)", icon: <Wand2 className="w-4 h-4" />,     tagline: "Symbolic visual language" },
  SCRIPTWRITER:       { color: "#ff6d5a", bg: "rgba(255,109,90,0.12)",  ring: "rgba(255,109,90,0.4)",  icon: <PenTool className="w-4 h-4" />,   tagline: "Cinematic script" },
  STORYBOARD:         { color: "#ea4b71", bg: "rgba(234,75,113,0.12)",  ring: "rgba(234,75,113,0.4)",  icon: <Layers className="w-4 h-4" />,    tagline: "Scene-by-scene production plan" },
  VISUAL_GENERATION:  { color: "#fb7185", bg: "rgba(251,113,133,0.12)", ring: "rgba(251,113,133,0.4)", icon: <ImageIcon className="w-4 h-4" />, tagline: "Cinematic visuals per scene" },
  AUDIO_GENERATION:   { color: "#fb923c", bg: "rgba(251,146,60,0.12)",  ring: "rgba(251,146,60,0.4)",  icon: <Mic className="w-4 h-4" />,       tagline: "Narration + music brief" },
  SEO_OPTIMIZATION:   { color: "#34d399", bg: "rgba(52,211,153,0.12)",  ring: "rgba(52,211,153,0.4)",  icon: <Target className="w-4 h-4" />,    tagline: "Title, tags, description, chapters" },
  QUALITY_CHECK:      { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  ring: "rgba(251,191,36,0.4)",  icon: <ShieldCheck className="w-4 h-4" />, tagline: "7-dimension quality scoring" },
  THUMBNAIL_CREATION: { color: "#c084fc", bg: "rgba(192,132,252,0.12)", ring: "rgba(192,132,252,0.4)", icon: <Camera className="w-4 h-4" />,    tagline: "Click-optimized thumbnail" },
  MEMORY_STORAGE:     { color: "#10b981", bg: "rgba(16,185,129,0.12)",  ring: "rgba(16,185,129,0.4)",  icon: <Database className="w-4 h-4" />,  tagline: "Store learnings for next video" },
};

const STATUS_COLOR: Record<string, string> = {
  idle: "#5a5a6a",
  running: "#ff8b6e",
  done: "#34d399",
  error: "#f87171",
  skipped: "#5a5a6a",
};

interface WorkflowStage {
  stage: { id: string; label: string; agentName: string; statusName: string; progress: number; critical: boolean };
  status: "idle" | "running" | "done" | "error" | "skipped";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount?: number;
}

interface WorkflowData {
  project: {
    id: string; title?: string; concept?: string; status: string;
    currentStage?: string; stageProgress: number; errorMessage?: string;
    thumbnailUrl?: string;
  };
  workflow: WorkflowStage[];
}

// ─── Node Component ───────────────────────────────────────────────────────────
type NodeData = {
  stageId: string;
  label: string;
  status: "idle" | "running" | "done" | "error" | "skipped";
  agentName: string;
  error?: string;
  retryCount?: number;
  duration?: number;
  isSelected: boolean;
  onSelect: () => void;
  onRetry: () => void;
};

function StageNodeImpl({ data }: NodeProps<Node<NodeData>>) {
  const meta = STAGE_META[data.stageId] || STAGE_META.TREND_RESEARCH;
  const isRunning = data.status === "running";
  const isDone = data.status === "done";
  const isError = data.status === "error";
  const statusColor = STATUS_COLOR[data.status];

  return (
    <div
      onClick={data.onSelect}
      className="relative rounded-2xl cursor-pointer transition-all"
      style={{
        background: "var(--color-bg-1, #14141f)",
        border: `1px solid ${data.isSelected ? meta.ring : "rgba(255,255,255,0.08)"}`,
        boxShadow: data.isSelected ? `0 0 0 2px ${meta.ring}, 0 8px 32px rgba(0,0,0,0.4)` : "0 4px 16px rgba(0,0,0,0.25)",
        width: 220,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: meta.color, border: "none", width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: meta.color, border: "none", width: 8, height: 8 }} />

      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-white/5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.ring}` }}
        >
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white truncate">{data.label}</p>
          <p className="text-[10px] text-slate-500 truncate">{meta.tagline}</p>
        </div>
      </div>

      {/* Status row */}
      <div className="px-3 py-2 flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `${statusColor}22`, color: statusColor }}
        >
          {data.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
          {data.status === "done" && <Check className="w-3 h-3" />}
          {data.status === "error" && <AlertTriangle className="w-3 h-3" />}
          {data.status === "idle" && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
          {data.status === "skipped" && <MinusCircle className="w-3 h-3" />}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: statusColor }}>
          {data.status}
        </span>
        {(data.retryCount ?? 0) > 0 && (
          <span className="ml-auto text-[10px] text-amber-400">×{data.retryCount} retries</span>
        )}
      </div>

      {/* Action row */}
      {(isError || isDone) && (
        <div className="px-3 pb-2.5">
          <button
            onClick={(e) => { e.stopPropagation(); data.onRetry(); }}
            className="w-full px-2 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
            style={{
              background: isError ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.05)",
              color: isError ? "#fca5a5" : "#94a3b8",
              border: `1px solid ${isError ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <RefreshCw className="w-3 h-3" />
            {isError ? "Retry from here" : "Re-run from here"}
          </button>
        </div>
      )}

      {/* Running glow effect */}
      {isRunning && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
          style={{ boxShadow: `0 0 24px ${meta.color}66, inset 0 0 16px ${meta.color}22` }} />
      )}
    </div>
  );
}

const StageNode = React.memo(StageNodeImpl);
const nodeTypes = { stage: StageNode };

// ─── Edge style ───────────────────────────────────────────────────────────────
const EDGE_BASE = {
  type: "smoothstep" as const,
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#3a3a48" },
  style: { stroke: "#2a2a35", strokeWidth: 2 },
};

// ─── Main Workflow Component ──────────────────────────────────────────────────
export interface YoutubeWorkflowProps {
  projectId: string;
  onClose?: () => void;
}

export default function YoutubeWorkflow(props: YoutubeWorkflowProps) {
  return (
    <ReactFlowProvider>
      <YoutubeWorkflowInner {...props} />
    </ReactFlowProvider>
  );
}

function YoutubeWorkflowInner({ projectId, onClose }: YoutubeWorkflowProps) {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [stageDetail, setStageDetail] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showTokenHealth, setShowTokenHealth] = useState(false);

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await fetch(`/api/youtube/projects/${projectId}/workflow`);
      const json = await res.json();
      if (json.workflow) setData(json);
    } catch {}
  }, [projectId]);

  useEffect(() => { fetchWorkflow(); }, [fetchWorkflow]);

  // Poll while any stage is running
  useEffect(() => {
    if (!data) return;
    const anyRunning = data.workflow.some(w => w.status === "running") ||
                       (data.project.status !== "READY_TO_PUBLISH" && data.project.status !== "FAILED" && data.project.status !== "PUBLISHED" && data.project.status !== "IDEA");
    if (!anyRunning) return;
    const interval = setInterval(fetchWorkflow, 4000);
    return () => clearInterval(interval);
  }, [data, fetchWorkflow]);

  // Fetch stage detail when selected
  useEffect(() => {
    if (!selectedStage) { setStageDetail(null); return; }
    fetch(`/api/youtube/projects/${projectId}`)
      .then(r => r.json())
      .then(d => {
        const logs = d.project?.agentLogs || [];
        const stageName = selectedStage;
        const log = logs.find((l: any) => l.stageName === stageName);
        setStageDetail({ log, project: d.project });
      })
      .catch(() => setStageDetail(null));
  }, [selectedStage, projectId, data]);

  async function runProject(startFromStage?: string) {
    setActionLoading(startFromStage ?? "run");
    try {
      await fetch(`/api/youtube/projects/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startFromStage ? { startFromStage } : {}),
      });
      setTimeout(fetchWorkflow, 1500);
    } finally { setActionLoading(null); }
  }

  // Build ReactFlow graph
  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    // Layout in two rows of 6 for visual balance
    const itemsPerRow = 6;
    const colSpacing = 280;
    const rowSpacing = 180;

    const nodes: Node<NodeData>[] = data.workflow.map((w, i) => {
      const row = Math.floor(i / itemsPerRow);
      const col = row === 0 ? i : (itemsPerRow - 1 - (i - itemsPerRow));
      const x = 40 + col * colSpacing;
      const y = 40 + row * rowSpacing;

      return {
        id: w.stage.id,
        type: "stage",
        position: { x, y },
        data: {
          stageId: w.stage.id,
          label: w.stage.label,
          status: w.status,
          agentName: w.stage.agentName,
          error: w.error,
          retryCount: w.retryCount,
          isSelected: selectedStage === w.stage.id,
          onSelect: () => setSelectedStage(w.stage.id === selectedStage ? null : w.stage.id),
          onRetry: () => runProject(w.stage.id),
        },
        draggable: true,
      };
    });

    const edges: Edge[] = [];
    for (let i = 0; i < data.workflow.length - 1; i++) {
      const src = data.workflow[i].stage.id;
      const tgt = data.workflow[i + 1].stage.id;
      const srcRow = Math.floor(i / itemsPerRow);
      const tgtRow = Math.floor((i + 1) / itemsPerRow);
      const isRowTransition = srcRow !== tgtRow;

      edges.push({
        id: `e-${src}-${tgt}`,
        source: src,
        target: tgt,
        sourceHandle: isRowTransition ? "right" : undefined,
        ...EDGE_BASE,
        animated: data.workflow[i].status === "done" && data.workflow[i + 1].status === "running",
        style: {
          ...EDGE_BASE.style,
          stroke: data.workflow[i].status === "done" ? "#34d399" : "#2a2a35",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: data.workflow[i].status === "done" ? "#34d399" : "#3a3a48" },
      });
    }

    return { nodes, edges };
  }, [data, selectedStage]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-500" size={28} />
      </div>
    );
  }

  const project = data.project;
  const isFailed = project.status === "FAILED";
  const isReady = project.status === "READY_TO_PUBLISH";
  const isActive = !isFailed && !isReady && project.status !== "IDEA" && project.status !== "PUBLISHED";
  const overallProgress = data.workflow.filter(w => w.status === "done").length / data.workflow.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {onClose && (
            <button onClick={onClose} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
              <X size={14} /> Close workflow
            </button>
          )}
          <h2 className="text-lg font-semibold text-white truncate">{project.title || project.concept || "New Project"}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-500">{project.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isFailed ? "bg-red-500/10 text-red-400" :
              isReady ? "bg-emerald-500/10 text-emerald-400" :
              isActive ? "bg-blue-500/10 text-blue-400" :
              "bg-slate-500/10 text-slate-400"
            }`}>{project.status}</span>
            <span className="text-xs text-slate-500">{Math.round(overallProgress * 100)}% complete</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isFailed && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="text-xs text-red-300 max-w-xs truncate">{project.errorMessage}</span>
            </div>
          )}
          <button
            onClick={() => setShowTokenHealth(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-sm hover:bg-blue-500/20 transition-colors"
            title="Check health of all your HF tokens"
          >
            <Shield size={14} />
            Token Health
          </button>
          <button
            onClick={() => runProject()}
            disabled={actionLoading === "run" || isActive}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500/15 border border-violet-500/40 rounded-lg text-violet-300 text-sm hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === "run" ? <Loader2 size={14} className="animate-spin" /> :
              isFailed ? <RefreshCw size={14} /> :
              isReady ? <Check size={14} /> :
              <Play size={14} />
            }
            {isActive ? "Running..." : isFailed ? "Resume Pipeline" : isReady ? "Re-run All" : "Start Pipeline"}
          </button>
          <button onClick={fetchWorkflow} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {showTokenHealth && <TokenHealthModal onClose={() => setShowTokenHealth(false)} />}

      {/* Progress bar */}
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-emerald-500 transition-all duration-500"
          style={{ width: `${overallProgress * 100}%` }} />
      </div>

      {/* Main layout: workflow canvas + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Canvas */}
        <div className="rounded-xl border border-white/5 bg-[#0d0d15] overflow-hidden" style={{ height: 540 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f1f2e" />
            <Controls className="!bg-white/5 !border-white/10 !text-white" showInteractive={false} />
            <MiniMap
              className="!bg-white/3 !border-white/10"
              nodeColor={(n) => STAGE_META[(n.data as any).stageId]?.color ?? "#5a5a6a"}
              maskColor="rgba(0,0,0,0.6)"
            />
          </ReactFlow>
        </div>

        {/* Side panel: stage detail */}
        <div className="rounded-xl border border-white/5 bg-[#0d0d15] p-4 overflow-y-auto" style={{ maxHeight: 540 }}>
          {selectedStage ? (
            <StageDetailPanel
              stageId={selectedStage}
              detail={stageDetail}
              workflowStage={data.workflow.find(w => w.stage.id === selectedStage)}
              onRetry={() => runProject(selectedStage)}
              actionLoading={actionLoading === selectedStage}
            />
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Activity size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Click a stage to view details</p>
              <p className="text-xs mt-1">Pipeline state persists across retries — each stage resumes from where it failed</p>
              <div className="mt-6 space-y-2">
                {data.workflow.map(w => (
                  <button
                    key={w.stage.id}
                    onClick={() => setSelectedStage(w.stage.id)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-left transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[w.status] }} />
                    <span className="text-xs text-slate-300 flex-1 text-left">{w.stage.label}</span>
                    <ChevronRight size={12} className="text-slate-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stage Detail Panel ───────────────────────────────────────────────────────
function StageDetailPanel({ stageId, detail, workflowStage, onRetry, actionLoading }: {
  stageId: string;
  detail: any;
  workflowStage?: WorkflowStage;
  onRetry: () => void;
  actionLoading: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = STAGE_META[stageId];
  if (!meta || !workflowStage) return null;

  const log = detail?.log;
  const project = detail?.project;
  let parsedOutput: any = null;
  if (log?.output) {
    try { parsedOutput = JSON.parse(log.output); } catch {}
  }

  function copyRaw() {
    if (!log?.output) return;
    navigator.clipboard.writeText(log.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.ring}` }}
        >
          {meta.icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-white text-sm">{workflowStage.stage.label}</h3>
          <p className="text-xs text-slate-500">{workflowStage.stage.agentName}</p>
        </div>
      </div>

      {/* Status info */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status</span>
          <span className="font-mono uppercase tracking-wider" style={{ color: STATUS_COLOR[workflowStage.status] }}>
            {workflowStage.status}
          </span>
        </div>
        {workflowStage.startedAt && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Started</span>
            <span className="text-slate-300">{new Date(workflowStage.startedAt).toLocaleTimeString()}</span>
          </div>
        )}
        {workflowStage.completedAt && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Completed</span>
            <span className="text-slate-300">{new Date(workflowStage.completedAt).toLocaleTimeString()}</span>
          </div>
        )}
        {log?.duration && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Duration</span>
            <span className="text-slate-300">{(log.duration / 1000).toFixed(1)}s</span>
          </div>
        )}
        {(workflowStage.retryCount ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Retries</span>
            <span className="text-amber-400">{workflowStage.retryCount}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {workflowStage.error && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs font-medium text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-300/80 break-words">{workflowStage.error}</p>
        </div>
      )}

      {/* Stage-specific output preview */}
      {parsedOutput && !showRaw && (
        <StageOutputPreview stageId={stageId} output={parsedOutput} project={project} />
      )}

      {/* Scene gallery for VISUAL_GENERATION */}
      {stageId === "VISUAL_GENERATION" && project?.scenes && !showRaw && (
        <SceneGallery scenes={project.scenes} />
      )}

      {/* Audio narration player for AUDIO_GENERATION */}
      {stageId === "AUDIO_GENERATION" && project?.assets && !showRaw && (
        <AudioPlayer assets={project.assets} />
      )}

      {/* Toggle: raw output viewer */}
      {log?.output && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              {showRaw ? "Hide raw output" : "Show raw output"}
            </button>
            {showRaw && log?.output && (
              <button
                onClick={copyRaw}
                className="text-[10px] text-slate-500 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            )}
          </div>
          {showRaw && (
            <pre className="text-[10px] text-slate-300 bg-black/40 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto font-mono border border-white/5">
{log.output}
            </pre>
          )}
        </div>
      )}

      {/* Retry button */}
      <button
        onClick={onRetry}
        disabled={actionLoading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
      >
        {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Re-run from this stage
      </button>
      <p className="text-[10px] text-slate-600 text-center -mt-2">
        All later stages will also re-run with fresh outputs
      </p>
    </div>
  );
}

// ─── Stage-specific output rendering ──────────────────────────────────────────
function StageOutputPreview({ stageId, output, project }: { stageId: string; output: any; project: any }) {
  switch (stageId) {
    case "TREND_RESEARCH":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Top Ideas Found</p>
          <div className="space-y-1.5">
            {(output.ideas ?? []).slice(0, 5).map((i: any, idx: number) => (
              <div key={idx} className="p-2 rounded bg-white/3 border border-white/5">
                <p className="text-xs text-white truncate">{i.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Opportunity: {Math.round(i.opportunityScore)} · Virality: {Math.round(i.viralityScore)}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "NICHE_RESEARCH":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Audience Profile</p>
          <p className="text-xs text-slate-300">{output.psychologicalProfile?.substring(0, 200)}...</p>
          {output.coreDesires?.length && (
            <>
              <p className="text-xs font-medium text-slate-400 mt-2">Core Desires</p>
              <ul className="text-xs text-slate-300 space-y-0.5">
                {output.coreDesires.slice(0, 4).map((d: string, i: number) => (
                  <li key={i} className="flex gap-1.5"><span className="text-slate-600">·</span>{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      );

    case "INSIGHT_GEN":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Core Insight</p>
          <p className="text-xs text-slate-300 italic">"{output.coreInsight}"</p>
          {output.emotionalTruth && (
            <>
              <p className="text-xs font-medium text-slate-400 mt-2">Emotional Truth</p>
              <p className="text-xs text-slate-300">{output.emotionalTruth}</p>
            </>
          )}
        </div>
      );

    case "METAPHOR_ENGINE":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Central Metaphor</p>
          <p className="text-xs text-slate-300">{output.centralMetaphor}</p>
          {output.visualSymbol && (
            <p className="text-xs text-slate-400">Symbol: <span className="text-pink-300">{output.visualSymbol}</span></p>
          )}
          {output.colorPsychology && (
            <p className="text-[11px] text-slate-500">{output.colorPsychology}</p>
          )}
        </div>
      );

    case "SCRIPTWRITER":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Hook</p>
          <p className="text-xs text-slate-300 italic">"{output.hook}"</p>
          <div className="flex gap-3 text-xs mt-2">
            <div className="flex flex-col">
              <span className="text-slate-500">Retention</span>
              <span className="text-emerald-400 font-semibold">{output.retentionScore}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">Emotion</span>
              <span className="text-pink-400 font-semibold">{output.emotionScore}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">Originality</span>
              <span className="text-violet-400 font-semibold">{output.originalityScore}%</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">{output.wordCount} words · {Math.round((output.estimatedDuration ?? 0) / 60)} min</p>
        </div>
      );

    case "STORYBOARD":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Production Plan</p>
          <p className="text-xs text-slate-300">{output.totalScenes} scenes · {Math.round((output.totalDuration ?? 0) / 60)} min</p>
          <p className="text-[11px] text-slate-500">{output.visualStyle}</p>
          {output.colorGrading && (
            <p className="text-[11px] text-slate-500">Grade: {output.colorGrading}</p>
          )}
        </div>
      );

    case "SEO_OPTIMIZATION":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Optimized Title</p>
          <p className="text-xs text-white">{output.title}</p>
          <div className="flex gap-3 text-xs mt-2">
            <div className="flex flex-col">
              <span className="text-slate-500">CTR Prediction</span>
              <span className="text-emerald-400 font-semibold">{output.ctrPrediction}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">Tags</span>
              <span className="text-slate-300 font-semibold">{output.tags?.length ?? 0}</span>
            </div>
          </div>
          {output.primaryKeyword && (
            <p className="text-[11px] text-slate-500">Primary: <span className="text-green-300">{output.primaryKeyword}</span></p>
          )}
        </div>
      );

    case "QUALITY_CHECK":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Quality Report</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Overall:</span> <span className="text-white font-semibold">{output.overallScore}</span></div>
            <div><span className="text-slate-500">Script:</span> <span className="text-white">{output.scriptQuality}</span></div>
            <div><span className="text-slate-500">Visual:</span> <span className="text-white">{output.visualCoherence}</span></div>
            <div><span className="text-slate-500">Emotion:</span> <span className="text-white">{output.emotionalDepth}</span></div>
            <div><span className="text-slate-500">Retention:</span> <span className="text-white">{output.retentionPotential}</span></div>
            <div><span className="text-slate-500">SEO:</span> <span className="text-white">{output.seoStrength}</span></div>
          </div>
          {output.improvements?.length > 0 && (
            <>
              <p className="text-xs font-medium text-slate-400 mt-2">Suggestions</p>
              <ul className="text-[11px] text-slate-400 space-y-0.5">
                {output.improvements.slice(0, 3).map((s: string, i: number) => (
                  <li key={i} className="flex gap-1.5"><span className="text-slate-600">·</span>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      );

    case "VISUAL_GENERATION":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Visual Generation Summary</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/3 rounded p-2">
              <p className="text-slate-500 text-[10px]">Generated</p>
              <p className="text-emerald-400 font-semibold">{output.results?.length ?? 0}</p>
            </div>
            <div className="bg-white/3 rounded p-2">
              <p className="text-slate-500 text-[10px]">Failed</p>
              <p className="text-red-400 font-semibold">{output.failures?.length ?? 0}</p>
            </div>
          </div>
          {output.tokensUsed?.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mt-2">Tokens used ({output.tokensUsed.length})</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {output.tokensUsed.map((t: string) => (
                  <span key={t} className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}
          {output.tokensExhausted?.length > 0 && (
            <div>
              <p className="text-[10px] text-amber-400 mt-2">Tokens exhausted ({output.tokensExhausted.length})</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {output.tokensExhausted.map((t: string) => (
                  <span key={t} className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case "AUDIO_GENERATION":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Audio Generation</p>
          {output.narrationUrl ? (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
              <p className="text-xs text-emerald-400 font-medium">✓ Narration generated</p>
              <p className="text-[10px] text-slate-400 mt-1">{output.narrationChars} chars · {output.ttsModel}</p>
              {output.tokenUsed && <p className="text-[10px] text-slate-500 mt-0.5">Token: <span className="font-mono text-blue-300">{output.tokenUsed}</span></p>}
              {output.ttsProvider && <p className="text-[10px] text-slate-500">Provider: {output.ttsProvider}</p>}
            </div>
          ) : (
            <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
              <p className="text-xs text-red-400 font-medium">✗ Narration failed</p>
              {output.error && <p className="text-[10px] text-red-300/80 mt-1 break-words">{output.error}</p>}
            </div>
          )}
          {output.musicPrompt && (
            <>
              <p className="text-xs font-medium text-slate-400 mt-2">Music Brief</p>
              <p className="text-[11px] text-slate-300">{output.musicPrompt.substring(0, 200)}{output.musicPrompt.length > 200 ? "..." : ""}</p>
            </>
          )}
        </div>
      );

    case "THUMBNAIL_CREATION":
      return project?.thumbnailUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Generated Thumbnail</p>
          <img src={project.thumbnailUrl} alt="Thumbnail" className="w-full rounded border border-white/10" />
        </div>
      ) : (
        <p className="text-xs text-slate-500">No thumbnail generated yet</p>
      );

    default:
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Output Preview</p>
          <pre className="text-[10px] text-slate-400 overflow-x-auto bg-black/30 rounded p-2 max-h-32 overflow-y-auto font-mono">
            {JSON.stringify(output, null, 2).substring(0, 400)}{JSON.stringify(output, null, 2).length > 400 ? "..." : ""}
          </pre>
        </div>
      );
  }
}

// ─── Scene Gallery (for VISUAL_GENERATION stage) ──────────────────────────────
function SceneGallery({ scenes }: { scenes: any[] }) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<{ sceneId: string; token?: string; provider?: string } | null>(null);
  const [previewScene, setPreviewScene] = useState<any | null>(null);

  if (!scenes?.length) return null;
  const withImages = scenes.filter(s => s.imageUrl);
  const failed = scenes.filter(s => s.status === "FAILED");

  async function retryScene(sceneId: string) {
    setRetrying(sceneId);
    try {
      const res = await fetch(`/api/youtube/scenes/${sceneId}/retry`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRetryResult({ sceneId, token: data.tokenUsed, provider: data.provider });
        setTimeout(() => setRetryResult(null), 3000);
      } else {
        alert(`Retry failed: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Retry failed: ${e.message}`);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400">Scene Gallery</p>
        <span className="text-[10px] text-slate-500">{withImages.length}/{scenes.length} done</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {scenes.map((s: any) => {
          let meta: any = null;
          try { if (s.assets?.[0]?.metadata) meta = JSON.parse(s.assets[0].metadata); } catch {}
          const isRetrying = retrying === s.id;

          return (
            <div key={s.id} className="relative group rounded border border-white/10 overflow-hidden aspect-video bg-black/30">
              {s.imageUrl ? (
                <img
                  src={s.imageUrl}
                  alt={`Scene ${s.sceneNumber}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setPreviewScene(s)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {isRetrying || s.status === "GENERATING" ?
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> :
                   s.status === "FAILED" ? <AlertTriangle className="w-4 h-4 text-red-400" /> :
                   <span className="text-[10px] text-slate-600">#{s.sceneNumber}</span>}
                </div>
              )}
              <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                #{s.sceneNumber}
              </div>
              {/* Hover-revealed retry button */}
              {!isRetrying && (
                <button
                  onClick={(e) => { e.stopPropagation(); retryScene(s.id); }}
                  className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-black/70 hover:bg-violet-500/80 text-white p-1 rounded transition-opacity"
                  title="Re-generate this scene with next token"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                </button>
              )}
              {/* Token badge */}
              {meta?.tokenUsed && (
                <div className="absolute top-0.5 right-0.5 bg-blue-500/40 text-blue-100 text-[8px] px-1 rounded font-mono">
                  {meta.tokenUsed}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {retryResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
          <p className="text-[10px] text-emerald-400">
            ✓ Scene retried with token <span className="font-mono">{retryResult.token}</span> via {retryResult.provider}
          </p>
        </div>
      )}

      {failed.length > 0 && (
        <p className="text-[10px] text-red-400">
          {failed.length} scene{failed.length > 1 ? "s" : ""} failed — hover any tile and click ↻ to retry just that one with a fresh token
        </p>
      )}

      {/* Scene preview modal */}
      {previewScene && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewScene(null)}>
          <div className="max-w-4xl w-full bg-[#0d0d15] rounded-xl border border-white/10 p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Scene #{previewScene.sceneNumber} · {previewScene.type}</p>
              <button onClick={() => setPreviewScene(null)} className="p-1 hover:bg-white/10 rounded">
                <X size={14} />
              </button>
            </div>
            <img src={previewScene.imageUrl} className="w-full rounded border border-white/10" />
            <div className="mt-3 space-y-1 text-xs text-slate-400">
              <p><span className="text-slate-600">Narration:</span> {previewScene.scriptText}</p>
              <p><span className="text-slate-600">Camera:</span> {previewScene.cameraDirection}</p>
              <p><span className="text-slate-600">Environment:</span> {previewScene.environment}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Token Health Modal ───────────────────────────────────────────────────────
function TokenHealthModal({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/youtube/tokens/health");
      const data = await res.json();
      setHealth(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0d0d15] rounded-xl border border-white/10 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-400" size={18} />
            <h2 className="text-base font-semibold text-white">HF Token Health Check</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealth}
              disabled={refreshing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10 rounded text-slate-300 transition-colors"
            >
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-slate-400">
              <X size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-slate-500" size={28} />
            <span className="ml-3 text-sm text-slate-400">Testing each token against LLM, Image, TTS...</span>
          </div>
        ) : !health?.tokens?.length ? (
          <div className="text-center py-12 text-slate-500">
            <Key size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tokens configured</p>
            <p className="text-xs mt-1">Add tokens in Main App → Settings → Token Pool</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-white/3 rounded p-3">
                <p className="text-[10px] text-slate-500">Total Tokens</p>
                <p className="text-2xl font-bold text-white">{health.total}</p>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-3">
                <p className="text-[10px] text-emerald-400">Working LLM</p>
                <p className="text-2xl font-bold text-emerald-400">{health.summary?.llm ?? 0}</p>
              </div>
              <div className="bg-pink-500/5 border border-pink-500/20 rounded p-3">
                <p className="text-[10px] text-pink-400">Working Image</p>
                <p className="text-2xl font-bold text-pink-400">{health.summary?.image ?? 0}</p>
              </div>
              <div className="bg-orange-500/5 border border-orange-500/20 rounded p-3">
                <p className="text-[10px] text-orange-400">Working TTS</p>
                <p className="text-2xl font-bold text-orange-400">{health.summary?.tts ?? 0}</p>
              </div>
            </div>

            {/* Per-token grid */}
            <div className="space-y-2">
              {health.tokens.map((t: any, i: number) => (
                <div key={i} className="bg-white/3 border border-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Key size={12} className="text-slate-500" />
                      <span className="font-mono text-xs text-slate-300">{t.token}</span>
                      {t.whoami && <span className="text-[10px] text-slate-500">({t.whoami})</span>}
                    </div>
                    <span className="text-[10px] text-slate-600">{t.durationMs}ms</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <TokenStatusPill label="LLM" ok={t.llmOk} error={t.errors?.llm} />
                    <TokenStatusPill label="Image" ok={t.imageOk} error={t.errors?.image} />
                    <TokenStatusPill label="TTS" ok={t.ttsOk} error={t.errors?.tts} />
                  </div>
                  {/* Error details */}
                  {Object.entries(t.errors ?? {}).filter(([_, v]) => v).map(([k, v]: any) => (
                    <div key={k} className="text-[10px] text-red-300/70 bg-red-500/5 rounded px-2 py-1 mt-1">
                      <span className="text-red-400 font-medium">{k}:</span> {v.substring(0, 200)}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
              <p className="text-xs text-blue-200/70 font-medium mb-1">How token distribution works</p>
              <p className="text-[11px] text-slate-400">
                When the visual stage runs, scene N uses token[N % {health.total}]. If token X gets credit-exhausted mid-pipeline,
                the media layer skips X and tries other tokens. Each scene's badge shows which token actually succeeded.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TokenStatusPill({ label, ok, error }: { label: string; ok: boolean; error?: string }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
      ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
    }`} title={error}>
      {ok ? <Check size={9} /> : <X size={9} />}
      <span>{label}</span>
    </div>
  );
}

// ─── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ assets }: { assets: any[] }) {
  const narration = assets.find(a => a.type === "AUDIO_NARRATION");
  if (!narration) return null;

  let metadata: any = null;
  if (narration.metadata) {
    try { metadata = JSON.parse(narration.metadata); } catch {}
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-400">Narration Audio</p>
      <audio controls src={narration.url} className="w-full h-10" />
      <div className="text-[10px] text-slate-500 space-y-0.5">
        <p>Model: <span className="text-slate-300">{narration.model}</span></p>
        <p>Provider: <span className="text-slate-300">{narration.provider}</span></p>
        {metadata?.tokenUsed && <p>Token: <span className="font-mono text-blue-300">{metadata.tokenUsed}</span></p>}
        {metadata?.chars && <p>Length: <span className="text-slate-300">{metadata.chars} chars</span></p>}
      </div>
    </div>
  );
}
