"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Square, Plus, ChevronLeft, Trash2, X, Loader2, Inbox, Check, Sparkles, Globe, FileSearch, PenTool, Wand2, Image as ImageIcon, Camera, Activity, HelpCircle, Code2, Share2, Languages, AlignLeft, Volume2, Database, Eye, EyeOff, Users,
} from "lucide-react";
import { PipelineNode } from "./nodes";
import { NodeData, NodeRole, NodeStatus, ROLE_META, TeamInfo } from "./types";

interface ModelCatalog {
  catalog: Record<string, Array<{ id: string; label: string; description: string; badges?: string[]; context?: string }>>;
  defaults: Record<string, string>;
}

const IMAGE_STYLE_PRESETS = [
  { id: "photorealistic", label: "Photorealistic", emoji: "📷", modifier: "" },
  { id: "pencil-sketch", label: "Pencil Sketch", emoji: "✏️", modifier: "pencil sketch, hand-drawn, graphite drawing, black and white sketch, sketch art style," },
  { id: "watercolor", label: "Watercolor", emoji: "🎨", modifier: "watercolor painting, painterly, wet brush strokes, watercolor illustration, soft edges, artistic," },
  { id: "ink-drawing", label: "Ink Drawing", emoji: "🖋️", modifier: "pen and ink illustration, cross-hatching, bold ink lines, ink sketch, black ink on white paper," },
  { id: "charcoal", label: "Charcoal", emoji: "🪨", modifier: "charcoal drawing, charcoal sketch, rough texture, smudged charcoal, monochrome charcoal art," },
  { id: "oil-painting", label: "Oil Painting", emoji: "🖼️", modifier: "oil painting, impasto brushstrokes, painterly, oil on canvas, thick paint texture, classical style," },
  { id: "pastel-art", label: "Pastel Art", emoji: "🌸", modifier: "soft pastel drawing, chalk pastels, pastel art, gentle muted colors, soft dreamy texture," },
] as const;
type ImageStyleId = typeof IMAGE_STYLE_PRESETS[number]["id"];

const nodeTypes = { pipeline: PipelineNode };

export interface CanvasProps {
  modelCatalog: ModelCatalog | null;
  hasApiKey: boolean | null;
  onResult: (result: any) => void;
  onConnectKey: () => void;
}

let idCounter = 100;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

const EDGE_BASE = { animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: "#ff6d5a" }, style: { stroke: "#3a3a48", strokeWidth: 2 } };

function makeInitialGraph(catalog: ModelCatalog | null): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const d = catalog?.defaults || {};

  const nodes: Node<NodeData>[] = [
    { id: "input",   type: "pipeline", position: { x:   40, y: 240 }, data: { role: "input",   label: "URL Input",     status: "idle", config: { url: "", niche: "", audience: "", tone: "Professional & Informative", existingPosts: "", maxPages: 30 } } },
    { id: "crawl",   type: "pipeline", position: { x:  360, y: 240 }, data: { role: "crawl",   label: "Web Crawler",   status: "idle", meta: "Sitemap + on-page" } },
    { id: "extract", type: "pipeline", position: { x:  680, y: 240 }, data: { role: "extract", label: "Insight Extractor", status: "idle", model: d.extract || "Qwen/Qwen2.5-72B-Instruct" } },
    { id: "write",   type: "pipeline", position: { x: 1000, y: 240 }, data: { role: "write",   label: "Long-form Writer",  status: "idle", model: d.write   || "meta-llama/Llama-3.3-70B-Instruct" } },
    { id: "refine",  type: "pipeline", position: { x: 1320, y: 240 }, data: { role: "refine",  label: "SEO Refiner",       status: "idle", model: d.refine  || "deepseek-ai/DeepSeek-V3" } },
    { id: "output",  type: "pipeline", position: { x: 1640, y: 240 }, data: { role: "output",  label: "Final Article",     status: "idle" } },
  ];
  const edges: Edge[] = [
    { id: "e-input-crawl",   source: "input",   target: "crawl",   ...EDGE_BASE },
    { id: "e-crawl-extract", source: "crawl",   target: "extract", ...EDGE_BASE },
    { id: "e-extract-write", source: "extract", target: "write",   ...EDGE_BASE },
    { id: "e-write-refine",  source: "write",   target: "refine",  ...EDGE_BASE },
    { id: "e-refine-output", source: "refine",  target: "output",  ...EDGE_BASE },
  ];
  return { nodes, edges };
}

const CORE_IDS = new Set(["input", "crawl", "extract", "write", "refine", "output"]);

function CanvasInner({ modelCatalog, hasApiKey, onResult, onConnectKey }: CanvasProps) {
  const initial = useMemo(() => makeInitialGraph(modelCatalog), [modelCatalog]);
  const [nodes, setNodes] = useState<Node<NodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>("input");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loadingTeamWorkflow, setLoadingTeamWorkflow] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);

  // refs that always reflect latest nodes/edges (the executor reads via these to avoid stale state)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    if (!modelCatalog) return;
    setNodes((prev) => prev.map((n) => {
      if (n.data.model || !modelCatalog.defaults[n.data.role]) return n;
      return { ...n, data: { ...n.data, model: modelCatalog.defaults[n.data.role] } };
    }));
  }, [modelCatalog]);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<NodeData>[]), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn: Connection) => setEdges((eds) => addEdge({ ...conn, id: nextId("e"), ...EDGE_BASE }, eds)), []);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const updateNode = useCallback((id: string, patch: Partial<NodeData>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const setNodeStatus = useCallback((id: string, status: NodeStatus, extras: Partial<NodeData> = {}) => {
    // Mutate the ref synchronously so downstream executor iterations see the new output
    // before React has finished re-rendering. Without this, "Run Workflow" fires Extract before
    // the Crawl node's output has been committed to state.
    nodesRef.current = nodesRef.current.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, status, ...extras } } : n
    );
    edgesRef.current = edgesRef.current.map((e) => {
      if (e.source !== id) return e;
      if (status === "running") return { ...e, animated: true, style: { ...(e.style || {}), stroke: "#ff6d5a", strokeWidth: 2.5 } };
      if (status === "done")    return { ...e, animated: false, style: { ...(e.style || {}), stroke: "#34d399", strokeWidth: 2 } };
      if (status === "error")   return { ...e, animated: false, style: { ...(e.style || {}), stroke: "#f87171", strokeWidth: 2 } };
      return { ...e, animated: false, style: { ...(e.style || {}), stroke: "#3a3a48", strokeWidth: 2 } };
    });
    setNodes(nodesRef.current);
    setEdges(edgesRef.current);
  }, []);

  const resetStatuses = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, status: "idle", errorMsg: undefined, output: undefined } })));
    setEdges((prev) => prev.map((e) => ({ ...e, animated: false, style: { stroke: "#3a3a48", strokeWidth: 2 } })));
  }, []);

  const addLog = useCallback((line: string) => {
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-300));
  }, []);

  const setupTeamWorkflow = useCallback(async () => {
    setLoadingTeamWorkflow(true);
    addLog("Setting up team workflow…");
    try {
      const resp = await fetch("/api/teams/setup-defaults", { method: "POST" });
      const { teams: defaultTeams } = await resp.json();
      if (!defaultTeams?.length) throw new Error("No teams returned");

      setTeams(defaultTeams);
      const ext = defaultTeams.find((t: TeamInfo) => t.name === "Extraction Team");
      const wrt = defaultTeams.find((t: TeamInfo) => t.name === "Writing Team");
      const ref = defaultTeams.find((t: TeamInfo) => t.name === "Refinement Team");
      const img = defaultTeams.find((t: TeamInfo) => t.name === "Image Team");
      const vid = defaultTeams.find((t: TeamInfo) => t.name === "Video Team");

      const newNodes: Node<NodeData>[] = [
        { id: "input",    type: "pipeline", position: { x: 40,   y: 280 }, data: { role: "input",   label: "URL Input",          status: "idle", config: { url: "", niche: "", audience: "", tone: "Professional & Informative", existingPosts: "", maxPages: 90 } } },
        { id: "crawl",    type: "pipeline", position: { x: 360,  y: 280 }, data: { role: "crawl",   label: "Web Crawler",         status: "idle", meta: "Sitemap + on-page" } },
        { id: "extract",  type: "pipeline", position: { x: 680,  y: 280 }, data: { role: "extract", label: "Parallel Extraction",  status: "idle", teamId: ext?.id, teamName: ext?.name } },
        { id: "write",    type: "pipeline", position: { x: 1000, y: 280 }, data: { role: "write",   label: "Chain Writer",         status: "idle", teamId: wrt?.id, teamName: wrt?.name } },
        { id: "refine",   type: "pipeline", position: { x: 1320, y: 280 }, data: { role: "refine",  label: "Chain Refiner",        status: "idle", teamId: ref?.id, teamName: ref?.name } },
        { id: "output",   type: "pipeline", position: { x: 2080, y: 280 }, data: { role: "output",  label: "Final Article",        status: "idle" } },
        { id: "image-1",  type: "pipeline", position: { x: 680,  y: 520 }, data: { role: "image",   label: "Image Team",           status: "idle", teamId: img?.id, teamName: img?.name, config: { prompt: "", imageStyle: "photorealistic" } } },
        { id: "video-1",  type: "pipeline", position: { x: 1000, y: 520 }, data: { role: "video",   label: "Video Team",           status: "idle", teamId: vid?.id, teamName: vid?.name, config: { prompt: "" } } },
        { id: "faq-1",    type: "pipeline", position: { x: 1320, y: 520 }, data: { role: "faq",     label: "FAQ Generator",        status: "idle", model: modelCatalog?.defaults?.faq || "deepseek-ai/DeepSeek-V3", config: { count: 8 } } },
        { id: "social-1", type: "pipeline", position: { x: 1640, y: 520 }, data: { role: "social",  label: "Social Posts",         status: "idle", model: modelCatalog?.defaults?.social || "meta-llama/Llama-3.3-70B-Instruct", config: { platforms: ["twitter","linkedin","instagram"] } } },
        { id: "schema-1", type: "pipeline", position: { x: 1960, y: 520 }, data: { role: "schema",  label: "Schema JSON-LD",       status: "idle" } },
        { id: "publish-1",type: "pipeline", position: { x: 1800, y: 740 }, data: { role: "publish", label: "Publish to DB",        status: "idle", config: { status: "draft" } } },
      ];
      const newEdges: Edge[] = [
        { id: "e-in-cr",  source: "input",   target: "crawl",     ...EDGE_BASE },
        { id: "e-cr-ex",  source: "crawl",   target: "extract",   ...EDGE_BASE },
        { id: "e-ex-wr",  source: "extract", target: "write",     ...EDGE_BASE },
        { id: "e-wr-re",  source: "write",   target: "refine",    ...EDGE_BASE },
        { id: "e-re-out", source: "refine",  target: "output",    ...EDGE_BASE },
        { id: "e-re-img", source: "refine",  target: "image-1",   ...EDGE_BASE },
        { id: "e-img-vid",source: "image-1", target: "video-1",   ...EDGE_BASE },
        { id: "e-wr-faq", source: "write",   target: "faq-1",     ...EDGE_BASE },
        { id: "e-re-soc", source: "refine",  target: "social-1",  ...EDGE_BASE },
        { id: "e-re-sch", source: "refine",  target: "schema-1",  ...EDGE_BASE },
        { id: "e-re-pub", source: "refine",  target: "publish-1", ...EDGE_BASE },
      ];
      setNodes(newNodes);
      setEdges(newEdges);
      addLog(`✓ Team workflow ready · ${newNodes.length} nodes`);
      addLog(`  Extract: ${ext?.members?.length || 0} workers (parallel) · Write: ${wrt?.members?.length || 0} chain · Refine: ${ref?.members?.length || 0} chain`);
      addLog(`  Image: ${img?.members?.length || 0} workers (first-win) · Video: ${vid?.members?.length || 0} workers (first-win)`);
    } catch (e: any) {
      addLog(`✗ Team workflow setup failed: ${e.message}`);
    } finally {
      setLoadingTeamWorkflow(false);
    }
  }, [addLog, modelCatalog]);

  const addNode = useCallback((role: NodeRole, autoSource?: string) => {
    const id = nextId(role);
    const defaults = modelCatalog?.defaults || {};
    const labels: Record<string, string> = {
      image: "Image Generator", video: "Video Generator", compare: "Compare Writer",
      faq: "FAQ Generator", schema: "Schema JSON-LD", social: "Social Posts",
      translate: "Translate", summarize: "TL;DR", tts: "Audio Narration", publish: "Publish to DB",
    };
    const taglines: Record<string, string> = {
      image: "Featured or section image",
      video: "Hero video (text-to-video)",
      compare: "Second writer in parallel",
      faq: "PAA-style Q&A",
      schema: "Article + FAQPage JSON-LD",
      social: "Twitter/LinkedIn/IG posts",
      translate: "Multilingual article copy",
      summarize: "Short TL;DR",
      tts: "Voice narration of the article",
      publish: "Save to Postgres",
    };
    const data: NodeData = {
      role, status: "idle",
      label: labels[role] || role,
      meta: taglines[role],
      model: defaults[role] || undefined,
      config:
        role === "image" ? { prompt: "", imageStyle: "photorealistic" } :
        role === "video" ? { prompt: "" } :
        role === "translate" ? { targetLang: "Spanish" } :
        role === "social" ? { platforms: ["twitter", "linkedin"] } :
        role === "summarize" ? { words: 80 } :
        role === "tts" ? { maxChars: 1500 } :
        role === "faq" ? { count: 6 } :
        role === "publish" ? { status: "draft" } :
        {},
    };
    const baseY = 480 + (Math.floor(Math.random() * 4) * 110);
    const baseX = 1000 + (Math.floor(Math.random() * 3) * 320);
    const node: Node<NodeData> = { id, type: "pipeline", position: { x: baseX, y: baseY }, data };
    setNodes((prev) => [...prev, node]);

    const src =
      autoSource ||
      (role === "compare" ? "extract" :
       role === "translate" ? "refine" :
       role === "summarize" ? "refine" :
       role === "social" ? "refine" :
       role === "faq" ? "refine" :
       role === "schema" ? "refine" :
       role === "tts" ? "refine" :
       role === "image" ? "refine" :
       role === "video" ? "refine" :
       role === "publish" ? "refine" :
       undefined);
    if (src) {
      setEdges((eds) => addEdge({ id: nextId("e"), source: src, target: id, ...EDGE_BASE }, eds));
    }
    setSelectedId(id);
  }, [modelCatalog]);

  const removeNode = useCallback((id: string) => {
    if (CORE_IDS.has(id)) return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  /* ============= GRAPH EXECUTOR ============= */

  // Walk upstream from a node id; return the first ancestor whose role matches predicate
  const findUpstreamOutput = useCallback((startId: string, predicate: (role: NodeRole) => boolean): any => {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const incomingEdges = edgesRef.current.filter((e) => e.target === cur);
      for (const e of incomingEdges) {
        const node = nodesRef.current.find((n) => n.id === e.source);
        if (!node) continue;
        if (predicate(node.data.role) && node.data.output !== undefined) {
          return { node, output: node.data.output };
        }
        queue.push(node.id);
      }
    }
    return null;
  }, []);

  const runStage = useCallback(async (stage: string, body: any, signal?: AbortSignal) => {
    const resp = await fetch(`/api/run/${stage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${resp.status}`);
    }
    return await resp.json();
  }, []);

  // Topological sort starting at input. Returns ordered list of node ids that are reachable.
  const topoOrder = useCallback((): string[] => {
    const ns = nodesRef.current;
    const es = edgesRef.current;
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of ns) { indeg.set(n.id, 0); adj.set(n.id, []); }
    for (const e of es) {
      indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
      adj.get(e.source)!.push(e.target);
    }
    const queue: string[] = [];
    for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
    const order: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const n of adj.get(cur) || []) {
        indeg.set(n, indeg.get(n)! - 1);
        if (indeg.get(n) === 0) queue.push(n);
      }
    }
    return order;
  }, []);

  // Determine input payload for a node based on its role + upstream outputs + input config
  const buildBodyFor = useCallback((nodeId: string): any => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return null;
    const role = node.data.role;
    const inputNode = nodesRef.current.find((n) => n.id === "input");
    const ic = (inputNode?.data.config || {}) as Record<string, any>;
    const cfg = (node.data.config || {}) as Record<string, any>;

    switch (role) {
      case "crawl": {
        if (!ic.url) throw new Error("URL Input node has no URL set.");
        return { url: ic.url, maxPages: ic.maxPages || 30 };
      }
      case "extract": {
        const crawlOut = findUpstreamOutput(nodeId, (r) => r === "crawl");
        if (!crawlOut?.output?.full) throw new Error("No crawl output upstream. Run the Crawler first.");
        return {
          crawl: crawlOut.output.full,
          niche: ic.niche || "",
          audience: ic.audience || "",
          tone: ic.tone || "Professional & Informative",
          existingPosts: ic.existingPosts || "",
          model: node.data.model,
        };
      }
      case "write":
      case "compare": {
        const insights = findUpstreamOutput(nodeId, (r) => r === "extract");
        if (!insights?.output) throw new Error("No insights upstream. Run Extract first.");
        return {
          insights: insights.output,
          url: ic.url,
          niche: ic.niche || "",
          audience: ic.audience || "",
          tone: ic.tone || "Professional & Informative",
          existingPosts: ic.existingPosts || "",
          model: node.data.model,
        };
      }
      case "refine": {
        const art = findUpstreamOutput(nodeId, (r) => r === "write" || r === "compare");
        const insights = findUpstreamOutput(nodeId, (r) => r === "extract");
        if (!art?.output) throw new Error("No article upstream. Run Write first.");
        if (!insights?.output) throw new Error("No insights upstream. Run Extract first.");
        return { article: art.output, insights: insights.output, model: node.data.model };
      }
      case "faq":
      case "summarize": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        if (!art?.output) throw new Error("No article upstream.");
        const insights = findUpstreamOutput(nodeId, (r) => r === "extract")?.output;
        return role === "faq"
          ? { article: art.output, insights, count: cfg.count || 6, model: node.data.model }
          : { article: art.output, words: cfg.words || 80, model: node.data.model };
      }
      case "schema": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        if (!art?.output) throw new Error("No article upstream.");
        const faqs = findUpstreamOutput(nodeId, (r) => r === "faq")?.output;
        const articleWithFaqs = faqs ? { ...art.output, faqs } : art.output;
        return { article: articleWithFaqs };
      }
      case "social": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        if (!art?.output) throw new Error("No article upstream.");
        return { article: art.output, platforms: cfg.platforms || ["twitter", "linkedin"], model: node.data.model };
      }
      case "translate": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write");
        if (!art?.output) throw new Error("No article upstream.");
        return { article: art.output, targetLang: cfg.targetLang || "Spanish", model: node.data.model };
      }
      case "image": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        const explicit = (cfg.prompt as string)?.trim();
        const basePrompt = explicit || art?.output?.post?.featured_image_prompt || art?.output?.post?.title || ic.niche || "Editorial photographic illustration";
        const styleId = (cfg.imageStyle as ImageStyleId) || "photorealistic";
        const preset = IMAGE_STYLE_PRESETS.find((s) => s.id === styleId) || IMAGE_STYLE_PRESETS[0];
        const prompt = preset.modifier ? `${preset.modifier} ${basePrompt}` : basePrompt;
        return { prompt, model: node.data.model };
      }
      case "video": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        const explicit = (cfg.prompt as string)?.trim();
        const prompt = explicit || art?.output?.post?.featured_image_prompt || art?.output?.post?.title || ic.niche || "Editorial photographic illustration";
        // if there's an upstream Image node with a generated url, pass it for image-to-video models
        const upstreamImage = findUpstreamOutput(nodeId, (r) => r === "image");
        const imageDataUrl = upstreamImage?.output?.url as string | undefined;
        return { prompt, model: node.data.model, numFrames: 65, fps: 24, image: imageDataUrl };
      }
      case "tts": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        if (!art?.output) throw new Error("No article upstream.");
        return { article: art.output, model: node.data.model, maxChars: cfg.maxChars || 1500 };
      }
      case "publish": {
        const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
        if (!art?.output) throw new Error("No article upstream.");
        return { article: art.output, status: cfg.status || "draft" };
      }
      case "input":
      case "output":
      default:
        return null;
    }
  }, [findUpstreamOutput]);

  const stageNameFor = (role: NodeRole): string | null => {
    switch (role) {
      case "compare": return "write";
      case "input":
      case "output": return null;
      default: return role;
    }
  };

  // Run a single node (assumes upstream nodes already produced outputs)
  const executeSingleNode = useCallback(async (nodeId: string, signal?: AbortSignal): Promise<void> => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const role = node.data.role;

    if (role === "input") {
      const ic = (node.data.config || {}) as any;
      setNodeStatus(nodeId, "done", { meta: ic.url || "(no url)" });
      addLog(`Input → ${ic.url || "(empty)"}`);
      return;
    }
    if (role === "output") {
      const art = findUpstreamOutput(nodeId, (r) => r === "refine" || r === "write" || r === "translate");
      setNodeStatus(nodeId, "done", { meta: art?.output?.post?.title || "ready", output: art?.output });
      if (art?.output) onResult({ refined: art.output, article: art.output, insights: findUpstreamOutput(nodeId, (r) => r === "extract")?.output });
      addLog(`Output ready · ${art?.output?.post?.title || ""}`);
      return;
    }

    const stage = stageNameFor(role);
    if (!stage) return;

    setNodeStatus(nodeId, "running");
    const teamId = node.data.teamId as number | undefined;
    const useTeam = teamId && (role === "extract" || role === "write" || role === "refine" || role === "image" || role === "video");
    addLog(useTeam ? `▶ ${role} · Team "${node.data.teamName || `#${teamId}`}"` : `▶ ${role} · ${node.data.model || ""}`);

    try {
      const body = buildBodyFor(nodeId);

      let out: any;
      if (useTeam) {
        const resp = await fetch(`/api/teams/${teamId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage, ...body }),
          signal,
        });
        if (!resp.ok) {
          const j = await resp.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${resp.status}`);
        }
        out = await resp.json();
        if (out?._teamMeta) {
          const tm = out._teamMeta;
          if (tm.mode === "parallel-chunks") {
            addLog(`  ↳ ${tm.membersRan} models · ${tm.pagesPerMember} pages each · results merged`);
          } else if (tm.mode === "first-win") {
            addLog(`  ↳ ${tm.memberUsed} · ${tm.modelUsed} · succeeded first`);
          } else {
            addLog(`  ↳ ${(tm.modelsUsed || []).length} models chained sequentially`);
          }
        }
      } else {
        out = await runStage(stage, body, signal);
      }

      // Media nodes (image/video/tts) may soft-skip when HF credits are exhausted
      if (out?.skipped) {
        const skipMsg = out.message || "Credits exhausted — skipped";
        setNodeStatus(nodeId, "skipped", { meta: skipMsg });
        addLog(`⚠ ${role} skipped · ${skipMsg}`);
        return;
      }

      let meta: string | undefined;
      switch (role) {
        case "crawl": meta = `${out.totalPages} pages · ${out.totalWords?.toLocaleString?.()} words`; break;
        case "extract": meta = `${(out.topics || []).length} topics · ${(out.targetKeywords || []).length} keywords`; break;
        case "write":
        case "compare":
        case "refine":
        case "translate": meta = (out.post?.title || "").slice(0, 60); break;
        case "faq": meta = `${(out.faqs || []).length} FAQs`; break;
        case "schema": meta = `${(out.jsonld || []).length} blocks`; break;
        case "social": meta = Object.keys(out).filter((k) => k !== "_teamMeta").join(" · "); break;
        case "summarize": meta = `${(out.tldr || "").split(/\s+/).length} words`; break;
        case "image": meta = `${Math.round((out.bytes || 0) / 1024)} KB · ${out.contentType || ""}`; break;
        case "video": meta = `${Math.round((out.bytes || 0) / 1024)} KB`; break;
        case "tts": meta = `${Math.round((out.bytes || 0) / 1024)} KB`; break;
        case "publish": meta = `Saved #${out.id}`; break;
      }
      setNodeStatus(nodeId, "done", { output: out, meta });
      addLog(`✓ ${role}${meta ? ` · ${meta}` : ""}`);
    } catch (e: any) {
      setNodeStatus(nodeId, "error", { errorMsg: e?.message || "failed" });
      addLog(`✗ ${role} · ${e?.message}`);
      throw e;
    }
  }, [addLog, buildBodyFor, findUpstreamOutput, onResult, runStage, setNodeStatus]);

  const runOneNode = useCallback(async (nodeId: string) => {
    if (isRunningRef.current) return;
    if (!hasApiKey) { onConnectKey(); return; }
    isRunningRef.current = true;
    setIsRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await executeSingleNode(nodeId, ctrl.signal);
    } catch {}
    finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [executeSingleNode, hasApiKey, onConnectKey]);

  const executeWorkflow = useCallback(async () => {
    const inputNode = nodesRef.current.find((n) => n.id === "input");
    const url = (inputNode?.data.config as any)?.url;
    if (!url) {
      alert("Click the URL Input node and set a target URL first.");
      setSelectedId("input");
      return;
    }
    if (!hasApiKey) { onConnectKey(); return; }

    resetStatuses();
    setLogs([]);
    addLog(`▶ Executing workflow → ${url}`);
    isRunningRef.current = true;
    setIsRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const order = topoOrder();
    addLog(`Plan · ${order.length} nodes · ${order.join(" → ")}`);

    try {
      for (const nid of order) {
        if (ctrl.signal.aborted) break;
        try {
          await executeSingleNode(nid, ctrl.signal);
        } catch (e: any) {
          // continue with siblings, but skip downstream of this failure
          // Mark all descendants as skipped
          const desc = new Set<string>();
          const queue = [nid];
          while (queue.length) {
            const cur = queue.shift()!;
            const children = edgesRef.current.filter((e) => e.source === cur).map((e) => e.target);
            for (const c of children) {
              if (!desc.has(c)) { desc.add(c); queue.push(c); }
            }
          }
          if (desc.size > 0) {
            setNodes((prev) => prev.map((n) => desc.has(n.id) && n.data.status === "idle" ? { ...n, data: { ...n.data, status: "skipped", meta: `skipped (upstream ${nid} failed)` } } : n));
            // also remove desc from later in the order loop (they'll be skipped naturally because their inputs are missing)
          }
        }
      }
      addLog("◼ Workflow complete");
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [addLog, executeSingleNode, hasApiKey, onConnectKey, resetStatuses, topoOrder]);

  const stopWorkflow = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    isRunningRef.current = false;
    addLog("◼ Workflow stopped by user");
  }, [addLog]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full bg-bg-0">
      {/* Left palette */}
      <aside className={`shrink-0 border-r border-line bg-bg-1 transition-all duration-200 overflow-hidden ${paletteOpen ? "w-72" : "w-12"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          {paletteOpen && <div className="neural-label">Node Palette</div>}
          <button onClick={() => setPaletteOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-bg-2 text-fg-2">
            <ChevronLeft className={`w-4 h-4 transition-transform ${paletteOpen ? "" : "rotate-180"}`} />
          </button>
        </div>
        {paletteOpen && (
          <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: "calc(100vh - 8rem)" }}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2 px-1 pt-1">Media</div>
            <PaletteButton icon={<ImageIcon className="w-4 h-4" />} color="#60a5fa" label="Image Generator" desc="FLUX / SD per section" onClick={() => addNode("image")} />
            <PaletteButton icon={<Camera className="w-4 h-4" />} color="#a78bfa" label="Video Generator" desc="LTX-Video / Hunyuan" onClick={() => addNode("video")} />
            <PaletteButton icon={<Volume2 className="w-4 h-4" />} color="#fb923c" label="Audio Narration" desc="TTS voice-over" onClick={() => addNode("tts")} />

            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2 px-1 pt-3">Content</div>
            <PaletteButton icon={<HelpCircle className="w-4 h-4" />} color="#22d3ee" label="FAQ Section" desc="PAA-style Q&A" onClick={() => addNode("faq")} />
            <PaletteButton icon={<AlignLeft className="w-4 h-4" />} color="#facc15" label="TL;DR Summary" desc="Short executive summary" onClick={() => addNode("summarize")} />
            <PaletteButton icon={<Share2 className="w-4 h-4" />} color="#f472b6" label="Social Posts" desc="Twitter / LinkedIn / IG" onClick={() => addNode("social")} />
            <PaletteButton icon={<Languages className="w-4 h-4" />} color="#38bdf8" label="Translate" desc="Multilingual copy" onClick={() => addNode("translate")} />
            <PaletteButton icon={<Activity className="w-4 h-4" />} color="#fbbf24" label="Compare Writer" desc="Second writer in parallel" onClick={() => addNode("compare")} />

            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2 px-1 pt-3">Distribution</div>
            <PaletteButton icon={<Code2 className="w-4 h-4" />} color="#a3e635" label="Schema JSON-LD" desc="Article + FAQPage markup" onClick={() => addNode("schema")} />
            <PaletteButton icon={<Database className="w-4 h-4" />} color="#10b981" label="Publish to DB" desc="Save as draft/published" onClick={() => addNode("publish")} />

            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2 px-1 pt-3">Teams</div>
            <button
              onClick={setupTeamWorkflow}
              disabled={loadingTeamWorkflow || isRunning}
              className="w-full surface-2 rounded-xl p-3 flex items-center gap-3 hover:border-line-2 transition-colors disabled:opacity-50 text-left"
              style={{ borderColor: "#8b5cf640" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#8b5cf61f", border: "1px solid #8b5cf64d", color: "#8b5cf6" }}>
                {loadingTeamWorkflow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">Load Team Workflow</div>
                <div className="text-[10px] text-fg-2">Creates 3 teams + full canvas setup</div>
              </div>
              <Plus className="w-3.5 h-3.5 text-fg-2" />
            </button>
            {teams.length > 0 && (
              <>
                <div className="text-[10px] text-fg-3 px-1 -mt-1">Active teams — assign via node drawer</div>
                {teams.map((team) => {
                  const activeCount = team.members.filter((m) => m.is_active).length;
                  return (
                    <div key={team.id} className="w-full surface-2 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#8b5cf61f", border: "1px solid #8b5cf64d", color: "#8b5cf6" }}>
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white truncate">{team.name}</div>
                        <div className="text-[10px] text-fg-2">{activeCount} worker{activeCount !== 1 ? "s" : ""} · {team.task_type}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2 px-1 pt-3">Execution log</div>
            <div className="surface-2 rounded-xl p-3 max-h-72 overflow-y-auto custom-scrollbar space-y-1 text-[10px] font-mono">
              {logs.length === 0 ? (
                <div className="text-fg-3">— no events —</div>
              ) : logs.map((l, i) => (
                <div key={i} className="text-fg-2">{l}</div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative">
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2 pointer-events-none">
          <div className="pointer-events-auto surface-2 rounded-xl px-3 py-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#ff8b6e]" />
            <span className="text-xs font-mono text-fg-1">Workflow Canvas</span>
            <span className="chip ml-1 text-[10px]">{nodes.length} nodes · {edges.length} edges</span>
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto flex items-center gap-2">
            {selectedNode && !CORE_IDS.has(selectedNode.id) && (
              <button onClick={() => removeNode(selectedNode.id)} className="btn-secondary py-2 px-3 text-xs text-red-300!"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
            )}
            {selectedNode && selectedNode.data.role !== "output" && (
              <button onClick={() => runOneNode(selectedNode.id)} disabled={isRunning} className="btn-secondary py-2 px-3 text-xs">
                <Play className="w-3.5 h-3.5" /> Run this node
              </button>
            )}
            {isRunning ? (
              <button onClick={stopWorkflow} className="btn-secondary py-2 px-4 text-xs"><Square className="w-3.5 h-3.5" /> Stop</button>
            ) : (
              <button onClick={executeWorkflow} className="btn-primary py-2 px-5 text-xs"><Play className="w-3.5 h-3.5" /> Execute Workflow</button>
            )}
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
          minZoom={0.25}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="rgba(255,255,255,0.06)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            position="bottom-right" zoomable pannable
            maskColor="rgba(14,14,16,0.85)"
            nodeColor={(n) => ROLE_META[(n.data as NodeData).role].color}
            nodeStrokeColor="transparent"
            nodeBorderRadius={6}
            style={{ background: "var(--color-bg-1)", border: "1px solid var(--color-line)" }}
          />
        </ReactFlow>
      </div>

      {/* Right config drawer */}
      {selectedNode && (
        <aside className="shrink-0 w-96 border-l border-line bg-bg-1 overflow-y-auto custom-scrollbar">
          <NodeConfigDrawer
            key={selectedNode.id}
            node={selectedNode}
            modelCatalog={modelCatalog}
            teams={teams}
            onChange={(patch) => updateNode(selectedNode.id, patch)}
            onClose={() => setSelectedId(null)}
            onRemove={() => removeNode(selectedNode.id)}
            onRun={() => runOneNode(selectedNode.id)}
            running={isRunning}
            removable={!CORE_IDS.has(selectedNode.id)}
          />
        </aside>
      )}
    </div>
  );
}

function PaletteButton({ icon, color, label, desc, onClick }: { icon: React.ReactNode; color: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full surface-2 hover:border-line-2 transition-colors rounded-xl p-3 flex items-center gap-3 text-left">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f`, border: `1px solid ${color}4d`, color }}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">{label}</div>
        <div className="text-[10px] text-fg-2 truncate">{desc}</div>
      </div>
      <Plus className="w-3.5 h-3.5 text-fg-2" />
    </button>
  );
}

function NodeConfigDrawer({ node, modelCatalog, teams, onChange, onClose, onRemove, onRun, running, removable }: { node: Node<NodeData>; modelCatalog: ModelCatalog | null; teams: TeamInfo[]; onChange: (patch: Partial<NodeData>) => void; onClose: () => void; onRemove: () => void; onRun: () => void; running: boolean; removable: boolean }) {
  const [showOutput, setShowOutput] = useState(false);
  const meta = ROLE_META[node.data.role];
  const role = node.data.role;
  const cfg = (node.data.config || {}) as Record<string, any>;
  const setCfg = (k: string, v: any) => onChange({ config: { ...cfg, [k]: v } });

  const roleToCatalog: Record<string, string> = {
    extract: "extract", write: "write", compare: "write", refine: "refine",
    image: "image", video: "video", tts: "tts",
    faq: "faq", social: "social", translate: "translate", summarize: "summarize",
  };
  const modelOptions = modelCatalog?.catalog[roleToCatalog[role] || ""] || null;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.bg, border: `1px solid ${meta.ring}`, color: meta.color }}>
            {role === "input" && <Inbox className="w-4 h-4" />}
            {role === "crawl" && <Globe className="w-4 h-4" />}
            {role === "extract" && <FileSearch className="w-4 h-4" />}
            {role === "write" && <PenTool className="w-4 h-4" />}
            {role === "refine" && <Wand2 className="w-4 h-4" />}
            {role === "image" && <ImageIcon className="w-4 h-4" />}
            {role === "video" && <Camera className="w-4 h-4" />}
            {role === "compare" && <Activity className="w-4 h-4" />}
            {role === "output" && <Check className="w-4 h-4" />}
            {role === "faq" && <HelpCircle className="w-4 h-4" />}
            {role === "schema" && <Code2 className="w-4 h-4" />}
            {role === "social" && <Share2 className="w-4 h-4" />}
            {role === "translate" && <Languages className="w-4 h-4" />}
            {role === "summarize" && <AlignLeft className="w-4 h-4" />}
            {role === "tts" && <Volume2 className="w-4 h-4" />}
            {role === "publish" && <Database className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <input
              value={node.data.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="bg-transparent text-white font-semibold text-sm focus:outline-none w-full"
            />
            <div className="text-[10px] font-mono uppercase tracking-widest text-fg-2">{meta.tagline}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2 text-fg-2 shrink-0"><X className="w-4 h-4" /></button>
      </div>

      <div className="surface-2 rounded-xl p-3 flex items-center justify-between">
        <div className="micro-label">Status</div>
        <span className="chip" style={{ color: meta.color, borderColor: meta.ring }}>{node.data.status}</span>
      </div>

      {role !== "output" && (
        <button onClick={onRun} disabled={running} className="btn-primary w-full">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Running…" : `Run ${node.data.label}`}
        </button>
      )}

      {/* Per-role config */}
      {role === "input" && (
        <div className="space-y-3">
          <Field label="Source URL"><input className="glass-input w-full font-mono" placeholder="https://example.com" value={cfg.url || ""} onChange={(e) => setCfg("url", e.target.value)} /></Field>
          <Field label="Niche / Topic"><input className="glass-input w-full" placeholder="e.g. ESG Investing" value={cfg.niche || ""} onChange={(e) => setCfg("niche", e.target.value)} /></Field>
          <Field label="Audience"><input className="glass-input w-full" placeholder="e.g. Retail Investors" value={cfg.audience || ""} onChange={(e) => setCfg("audience", e.target.value)} /></Field>
          <Field label="Tone"><input className="glass-input w-full" value={cfg.tone || ""} onChange={(e) => setCfg("tone", e.target.value)} /></Field>
          <Field label={`Max Pages · ${cfg.maxPages || 30}`}>
            <input type="range" min={5} max={60} value={cfg.maxPages || 30} onChange={(e) => setCfg("maxPages", parseInt(e.target.value))} className="w-full accent-brand" />
          </Field>
          <Field label="Constraints / Keywords">
            <textarea className="glass-input w-full font-mono text-[12px] min-h-20" placeholder="Phrases to include or avoid…" value={cfg.existingPosts || ""} onChange={(e) => setCfg("existingPosts", e.target.value)} />
          </Field>
        </div>
      )}

      {role === "crawl" && (
        <div className="text-xs text-fg-2 leading-relaxed">Reads <code className="text-[#ff8b6e]">/sitemap.xml</code> and on-page links. Configure depth via the <strong className="text-white">Max Pages</strong> slider on the URL Input node.</div>
      )}

      {/* Team mode for extract / write / refine / image / video */}
      {(role === "extract" || role === "write" || role === "refine" || role === "image" || role === "video") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="micro-label">Execution Mode</label>
            <div className="flex gap-1">
              <button
                onClick={() => onChange({ teamId: undefined, teamName: undefined })}
                className={`chip text-[10px] transition-colors ${!node.data.teamId ? "!text-[#ff8b6e] !border-[#ff6d5a]/40" : ""}`}
              >Single Model</button>
              <button
                onClick={() => {}}
                className={`chip text-[10px] transition-colors ${node.data.teamId ? "!text-[#8b5cf6] !border-[#8b5cf6]/40" : ""}`}
              >Team</button>
            </div>
          </div>

          {/* Team selector */}
          {teams.length > 0 ? (
            <Field label="Team Assignment">
              <select
                className="glass-input w-full"
                value={node.data.teamId || ""}
                onChange={(e) => {
                  const team = teams.find((t) => t.id === parseInt(e.target.value));
                  onChange({ teamId: team?.id, teamName: team?.name, model: team ? undefined : node.data.model });
                }}
              >
                <option value="">— No Team (Single Model) —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id} className="bg-bg-2">
                    {t.name} ({t.members.filter((m) => m.is_active).length} workers)
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="text-[11px] text-fg-3">
              No teams yet — create one in the Teams section to enable parallel execution.
            </div>
          )}

          {/* Team members preview */}
          {node.data.teamId && (() => {
            const team = teams.find((t) => t.id === node.data.teamId);
            if (!team) return null;
            const activeMembers = team.members.filter((m) => m.is_active).sort((a, b) => a.priority - b.priority);
            const isParallel = role === "extract";
            const isFirstWin = role === "image" || role === "video";
            const modeColor = isParallel ? "#60a5fa" : isFirstWin ? "#34d399" : "#fbbf24";
            const modeLabel = isParallel ? "parallel chunks" : isFirstWin ? "first-win" : "sequential chain";
            return (
              <div className="surface-2 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="micro-label">{activeMembers.length} Workers</span>
                  <span className="chip text-[9px]" style={{ color: modeColor, borderColor: `${modeColor}40` }}>
                    {modeLabel}
                  </span>
                </div>
                {activeMembers.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ background: `${modeColor}1f`, border: `1px solid ${modeColor}4d`, color: modeColor }}
                    >{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono text-fg-1 truncate">{m.model_id}</div>
                      <div className="text-[9px] text-fg-3">{m.model_label}</div>
                    </div>
                    <span className="text-[9px] font-mono shrink-0" style={{ color: modeColor }}>
                      {isParallel ? `chunk ${i + 1}` : isFirstWin ? (i === 0 ? "primary" : `fallback ${i}`) : i === 0 ? "drafts" : "improves"}
                    </span>
                  </div>
                ))}
                <div className="text-[10px] text-fg-3 pt-1 border-t border-line leading-relaxed">
                  {isParallel
                    ? `Crawled pages split equally across ${activeMembers.length} models — results merged into one insight set.`
                    : isFirstWin
                    ? `Workers tried in order. First success wins. Each worker uses its own dedicated HF token — set per-worker tokens in the Teams section to spread credit usage.`
                    : `Model 1 writes the draft. Each subsequent model receives the previous output and improves it.`}
                </div>
              </div>
            );
          })()}

          {/* Single model selector — only when no team assigned */}
          {!node.data.teamId && (
            <Field label="Model">
              {modelOptions ? (
                <select className="glass-input w-full font-mono text-[12px]" value={node.data.model || ""} onChange={(e) => onChange({ model: e.target.value })}>
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id} className="bg-bg-2">{m.label} — {m.id}</option>
                  ))}
                </select>
              ) : <div className="text-xs text-fg-2">Loading catalog…</div>}
              {modelOptions && (
                <div className="mt-2 text-[11px] text-fg-2">{modelOptions.find((m) => m.id === node.data.model)?.description}</div>
              )}
            </Field>
          )}
        </div>
      )}

      {/* Single model selector for other roles (image, video, compare, faq, etc.) */}
      {(role === "image" || role === "video" || role === "compare" || role === "faq" || role === "social" || role === "translate" || role === "summarize" || role === "tts") && (
        <Field label="Model">
          {modelOptions ? (
            <select className="glass-input w-full font-mono text-[12px]" value={node.data.model || ""} onChange={(e) => onChange({ model: e.target.value })}>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id} className="bg-bg-2">{m.label} — {m.id}</option>
              ))}
            </select>
          ) : <div className="text-xs text-fg-2">Loading catalog…</div>}
          {modelOptions && (
            <div className="mt-2 text-[11px] text-fg-2">{modelOptions.find((m) => m.id === node.data.model)?.description}</div>
          )}
        </Field>
      )}

      {(role === "image" || role === "video") && (
        <Field label="Prompt override (optional)">
          <textarea className="glass-input w-full font-mono text-[12px] min-h-20" placeholder="Leave empty to use article's featured prompt" value={cfg.prompt || ""} onChange={(e) => setCfg("prompt", e.target.value)} />
        </Field>
      )}

      {role === "image" && (
        <Field label="Image style">
          <div className="grid grid-cols-2 gap-1.5">
            {IMAGE_STYLE_PRESETS.map((preset) => {
              const active = (cfg.imageStyle || "photorealistic") === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setCfg("imageStyle", preset.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all text-xs ${
                    active
                      ? "border-[#ff6d5a]/60 bg-[#ff6d5a]/10 text-white"
                      : "border-line bg-bg-2 text-fg-2 hover:border-line-2 hover:text-fg-1"
                  }`}
                >
                  <span className="text-base leading-none">{preset.emoji}</span>
                  <span className="font-medium truncate">{preset.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff6d5a] shrink-0" />}
                </button>
              );
            })}
          </div>
          {(cfg.imageStyle && cfg.imageStyle !== "photorealistic") && (
            <div className="mt-1.5 text-[10px] text-fg-3 font-mono leading-relaxed">
              {IMAGE_STYLE_PRESETS.find((s) => s.id === cfg.imageStyle)?.modifier}
            </div>
          )}
        </Field>
      )}

      {role === "faq" && (
        <Field label={`Number of FAQs · ${cfg.count || 6}`}>
          <input type="range" min={3} max={12} value={cfg.count || 6} onChange={(e) => setCfg("count", parseInt(e.target.value))} className="w-full accent-brand" />
        </Field>
      )}

      {role === "summarize" && (
        <Field label={`Target words · ${cfg.words || 80}`}>
          <input type="range" min={30} max={250} value={cfg.words || 80} onChange={(e) => setCfg("words", parseInt(e.target.value))} className="w-full accent-brand" />
        </Field>
      )}

      {role === "translate" && (
        <Field label="Target language">
          <select className="glass-input w-full" value={cfg.targetLang || "Spanish"} onChange={(e) => setCfg("targetLang", e.target.value)}>
            {["Spanish","French","German","Italian","Portuguese","Hindi","Japanese","Korean","Mandarin Chinese","Arabic","Russian","Dutch","Swedish","Polish","Turkish"].map((l) => <option key={l} value={l} className="bg-bg-2">{l}</option>)}
          </select>
        </Field>
      )}

      {role === "social" && (
        <Field label="Platforms">
          <div className="flex flex-wrap gap-2">
            {(["twitter","linkedin","instagram"] as const).map((p) => {
              const selected = (cfg.platforms || []).includes(p);
              return (
                <button key={p} onClick={() => {
                  const cur: string[] = cfg.platforms || [];
                  setCfg("platforms", selected ? cur.filter((x) => x !== p) : [...cur, p]);
                }} className={`chip ${selected ? "!text-[#ff8b6e] !border-[#ff6d5a]/40" : ""}`}>{p}</button>
              );
            })}
          </div>
        </Field>
      )}

      {role === "tts" && (
        <Field label={`Max chars · ${cfg.maxChars || 1500}`}>
          <input type="range" min={300} max={3000} step={100} value={cfg.maxChars || 1500} onChange={(e) => setCfg("maxChars", parseInt(e.target.value))} className="w-full accent-brand" />
        </Field>
      )}

      {role === "publish" && (
        <Field label="Publish status">
          <div className="flex gap-2">
            {(["draft","published"] as const).map((s) => (
              <button key={s} onClick={() => setCfg("status", s)} className={`chip flex-1 ${cfg.status === s ? "!text-[#ff8b6e] !border-[#ff6d5a]/40" : ""}`}>{s}</button>
            ))}
          </div>
        </Field>
      )}

      {/* Output preview */}
      {node.data.output !== undefined && (
        <div className="space-y-2">
          <button onClick={() => setShowOutput((s) => !s)} className="w-full surface-2 px-3 py-2 rounded-xl flex items-center justify-between text-left">
            <span className="micro-label">Output preview</span>
            {showOutput ? <EyeOff className="w-3.5 h-3.5 text-fg-2" /> : <Eye className="w-3.5 h-3.5 text-fg-2" />}
          </button>
          {showOutput && <OutputPreview role={role} output={node.data.output} />}
        </div>
      )}

      {node.data.errorMsg && (
        <div className="surface-2 border border-red-500/30 bg-red-500/5 px-3 py-2 rounded-xl text-red-300 text-xs">{node.data.errorMsg}</div>
      )}

      {removable && (
        <button onClick={onRemove} className="btn-secondary w-full text-red-300! hover:bg-red-500/10!">
          <Trash2 className="w-3.5 h-3.5" /> Remove node
        </button>
      )}
    </div>
  );
}

function OutputPreview({ role, output }: { role: NodeRole; output: any }) {
  if (output == null) return null;
  if ((role === "image") && output.url) {
    return <img src={output.url} alt="generated" className="rounded-xl w-full" />;
  }
  if (role === "video" && output.url) {
    return <video src={output.url} controls className="rounded-xl w-full" />;
  }
  if (role === "tts" && output.url) {
    return <audio src={output.url} controls className="w-full" />;
  }
  if (role === "schema" && output.asString) {
    return <pre className="surface-2 rounded-xl p-3 text-[11px] font-mono text-fg-1 max-h-72 overflow-auto custom-scrollbar"><code>{output.asString}</code></pre>;
  }
  if (role === "summarize" && output.tldr) {
    return <div className="surface-2 rounded-xl p-3 text-sm text-fg-1 leading-relaxed">{output.tldr}</div>;
  }
  if (role === "social") {
    return (
      <div className="space-y-3">
        {output.twitter && (
          <div className="surface-2 rounded-xl p-3 space-y-1.5">
            <div className="micro-label">Twitter</div>
            {(output.twitter.thread || []).map((t: string, i: number) => (
              <div key={i} className="text-[12px] text-fg-1 leading-relaxed">{i + 1}. {t}</div>
            ))}
          </div>
        )}
        {output.linkedin && (
          <div className="surface-2 rounded-xl p-3 space-y-1.5">
            <div className="micro-label">LinkedIn</div>
            <pre className="whitespace-pre-wrap text-[12px] text-fg-1 leading-relaxed font-sans">{output.linkedin.post}</pre>
          </div>
        )}
        {output.instagram && (
          <div className="surface-2 rounded-xl p-3 space-y-1.5">
            <div className="micro-label">Instagram</div>
            <pre className="whitespace-pre-wrap text-[12px] text-fg-1 leading-relaxed font-sans">{output.instagram.caption}</pre>
          </div>
        )}
      </div>
    );
  }
  if (role === "faq" && Array.isArray(output.faqs)) {
    return (
      <div className="space-y-2">
        {output.faqs.map((f: any, i: number) => (
          <details key={i} className="surface-2 rounded-xl px-3 py-2">
            <summary className="text-xs text-white font-semibold cursor-pointer">{f.question}</summary>
            <div className="mt-2 text-[12px] text-fg-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: f.answer_html }} />
          </details>
        ))}
      </div>
    );
  }
  if ((role === "write" || role === "refine" || role === "translate" || role === "compare") && output.post) {
    return (
      <div className="surface-2 rounded-xl p-3 space-y-1.5">
        <div className="text-xs font-semibold text-white">{output.post.title}</div>
        <div className="text-[11px] text-fg-2 leading-relaxed">{output.post.meta_description}</div>
        <div className="text-[10px] font-mono text-fg-3">{(output.sections || []).length} sections · {(output.keywords || []).length} keywords</div>
      </div>
    );
  }
  if (role === "extract") {
    return (
      <div className="surface-2 rounded-xl p-3 space-y-2 text-[11px]">
        <div className="text-fg-1 leading-relaxed">{output.summary}</div>
        <div className="flex flex-wrap gap-1">
          {(output.targetKeywords || []).slice(0, 10).map((k: string, i: number) => <span key={i} className="chip-brand">{k}</span>)}
        </div>
      </div>
    );
  }
  if (role === "crawl") {
    return (
      <div className="surface-2 rounded-xl p-3 space-y-1.5 max-h-48 overflow-auto custom-scrollbar text-[11px] font-mono">
        {(output.pages || []).slice(0, 25).map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-2"><span className="text-fg-1 truncate flex-1">{p.title || p.url}</span><span className="text-fg-3 shrink-0">{p.words}w</span></div>
        ))}
      </div>
    );
  }
  if (role === "publish") {
    return <div className="surface-2 rounded-xl p-3 text-xs text-fg-1">Saved post #{output.id} · {output.title}</div>;
  }
  return (
    <pre className="surface-2 rounded-xl p-3 text-[10px] font-mono text-fg-1 max-h-72 overflow-auto custom-scrollbar"><code>{JSON.stringify(output, null, 2).slice(0, 4000)}</code></pre>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="micro-label block">{label}</label>
      {children}
    </div>
  );
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
