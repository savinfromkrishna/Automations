"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Youtube, Plus, Play, RefreshCw, Brain, Sparkles, Film, Music,
  Search, BarChart2, Clock, CheckCircle, XCircle, AlertCircle,
  Zap, Eye, Target, TrendingUp, Layers, Database, Settings,
  ChevronRight, Loader2, Star, Trash2, ArrowRight, Activity,
  FileText, Image, Mic, Video, Workflow as WorkflowIcon, ArrowLeft
} from "lucide-react";
import YoutubeWorkflow from "../../components/youtube/Workflow";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Channel {
  id: string; name: string; niche: string; subNiche?: string;
  tone: string; style: string; targetAudience?: string;
  publishFrequency: string; preferredDuration: number; isActive: boolean;
  createdAt: string;
  _count?: { projects: number; ideas: number; memories: number };
}

interface Project {
  id: string; channelId: string; title?: string; concept?: string;
  status: string; priority: number; trendScore?: number;
  viralityScore?: number; stageProgress: number; currentStage?: string;
  thumbnailUrl?: string; errorMessage?: string; createdAt: string;
  script?: { hook: string; retentionScore?: number; emotionScore?: number; estimatedDuration?: number };
  seo?: { title: string; ctrPrediction?: number; primaryKeyword?: string };
  _count?: { assets: number; scenes: number; agentLogs: number };
}

interface Idea {
  id: string; channelId: string; title: string; concept: string;
  hook?: string; targetEmotion?: string; trendScore: number;
  viralityScore: number; competitionScore: number; opportunityScore: number;
  status: string; createdAt: string;
}

interface Memory {
  id: string; channelId: string; type: string; key: string; value: string;
  confidence: number; usageCount: number; successRate?: number;
}

interface StatusData {
  channels: number; projectsByStatus: Record<string, number>;
  activeProjects: number; totalIdeas: number; totalMemories: number;
  totalAssets: number;
}

interface AutoTask {
  id: string; channelId: string; isActive: boolean; frequency: string;
  autoPublish: boolean; requireApproval: boolean; lastRun?: string;
  nextRun?: string; channel?: { name: string; niche: string };
}

// ─── Status Config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  IDEA:               { label: "Idea",             color: "text-slate-400",  bg: "bg-slate-800",  icon: Sparkles },
  RESEARCHING:        { label: "Researching",      color: "text-blue-400",   bg: "bg-blue-950",   icon: Search },
  SCRIPTING:          { label: "Scripting",         color: "text-violet-400", bg: "bg-violet-950", icon: FileText },
  STORYBOARDING:      { label: "Storyboarding",    color: "text-indigo-400", bg: "bg-indigo-950", icon: Layers },
  GENERATING_VISUALS: { label: "Visuals",          color: "text-pink-400",   bg: "bg-pink-950",   icon: Image },
  GENERATING_AUDIO:   { label: "Audio",            color: "text-orange-400", bg: "bg-orange-950", icon: Mic },
  EDITING:            { label: "Editing",          color: "text-yellow-400", bg: "bg-yellow-950", icon: Film },
  QUALITY_CHECK:      { label: "QA",               color: "text-cyan-400",   bg: "bg-cyan-950",   icon: CheckCircle },
  SEO_OPTIMIZATION:   { label: "SEO",              color: "text-green-400",  bg: "bg-green-950",  icon: Target },
  THUMBNAIL_CREATION: { label: "Thumbnail",        color: "text-fuchsia-400",bg: "bg-fuchsia-950",icon: Eye },
  READY_TO_PUBLISH:   { label: "Ready",            color: "text-emerald-400",bg: "bg-emerald-950",icon: CheckCircle },
  PUBLISHING:         { label: "Publishing",       color: "text-blue-400",   bg: "bg-blue-950",   icon: Youtube },
  PUBLISHED:          { label: "Published",        color: "text-green-400",  bg: "bg-green-900",  icon: CheckCircle },
  FAILED:             { label: "Failed",           color: "text-red-400",    bg: "bg-red-950",    icon: XCircle },
  PAUSED:             { label: "Paused",           color: "text-slate-400",  bg: "bg-slate-800",  icon: AlertCircle },
};

const ACTIVE_STATUSES = new Set(["RESEARCHING","SCRIPTING","STORYBOARDING","GENERATING_VISUALS","GENERATING_AUDIO","SEO_OPTIMIZATION","QUALITY_CHECK","THUMBNAIL_CREATION"]);

type View = "dashboard" | "channels" | "projects" | "ideas" | "memory" | "automation";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function YouTubePage() {
  const [view, setView] = useState<View>("dashboard");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<AutoTask[]>([]);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create forms
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", niche: "", subNiche: "", tone: "cinematic", style: "metaphorical", targetAudience: "", publishFrequency: "WEEKLY", preferredDuration: 8 });
  const [newProject, setNewProject] = useState({ concept: "", title: "" });

  const fetchAll = useCallback(async () => {
    try {
      const [chRes, prRes, stRes] = await Promise.all([
        fetch("/api/youtube/channels"),
        fetch("/api/youtube/projects?limit=50"),
        fetch("/api/youtube/status"),
      ]);
      const [chData, prData, stData] = await Promise.all([chRes.json(), prRes.json(), stRes.json()]);
      if (chData.channels) setChannels(chData.channels);
      if (prData.projects) setProjects(prData.projects);
      if (stData.channels !== undefined) setStatusData(stData);
    } catch {}
    setLoading(false);
  }, []);

  const fetchChannelData = useCallback(async (channelId: string) => {
    const [idRes, memRes, taskRes] = await Promise.all([
      fetch(`/api/youtube/ideas?channelId=${channelId}`),
      fetch(`/api/youtube/memory?channelId=${channelId}`),
      fetch(`/api/youtube/tasks?channelId=${channelId}`),
    ]);
    const [idData, memData, taskData] = await Promise.all([idRes.json(), memRes.json(), taskRes.json()]);
    if (idData.ideas) setIdeas(idData.ideas);
    if (memData.memories) setMemories(memData.memories);
    if (taskData.tasks) setTasks(taskData.tasks);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (selectedChannel) fetchChannelData(selectedChannel);
  }, [selectedChannel, fetchChannelData]);

  // Poll active projects every 8 seconds
  useEffect(() => {
    const hasActive = projects.some(p => ACTIVE_STATUSES.has(p.status));
    if (!hasActive) return;
    const interval = setInterval(() => {
      fetch("/api/youtube/projects?limit=50")
        .then(r => r.json())
        .then(d => { if (d.projects) setProjects(d.projects); });
    }, 8000);
    return () => clearInterval(interval);
  }, [projects]);

  async function createChannel() {
    if (!newChannel.name || !newChannel.niche) return;
    setActionLoading("create-channel");
    try {
      const res = await fetch("/api/youtube/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newChannel) });
      const data = await res.json();
      if (data.channel) {
        setChannels(prev => [data.channel, ...prev]);
        setSelectedChannel(data.channel.id);
        setShowCreateChannel(false);
        setNewChannel({ name: "", niche: "", subNiche: "", tone: "cinematic", style: "metaphorical", targetAudience: "", publishFrequency: "WEEKLY", preferredDuration: 8 });
      }
    } finally { setActionLoading(null); }
  }

  async function createProject() {
    if (!selectedChannel) return;
    setActionLoading("create-project");
    try {
      const res = await fetch(`/api/youtube/channels/${selectedChannel}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });
      const data = await res.json();
      if (data.projectId) {
        setTimeout(() => fetchAll(), 2000);
        setShowCreateProject(false);
        setNewProject({ concept: "", title: "" });
      }
    } finally { setActionLoading(null); }
  }

  async function runProject(projectId: string) {
    setActionLoading(`run-${projectId}`);
    try {
      await fetch(`/api/youtube/projects/${projectId}/run`, { method: "POST" });
      setTimeout(() => fetchAll(), 1500);
    } finally { setActionLoading(null); }
  }

  async function deleteProject(projectId: string) {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/youtube/projects/${projectId}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }

  async function createAutomationTask() {
    if (!selectedChannel) return;
    setActionLoading("create-task");
    try {
      const res = await fetch("/api/youtube/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannel, frequency: "WEEKLY", requireApproval: true }),
      });
      const data = await res.json();
      if (data.task) setTasks(prev => [data.task, ...prev]);
    } finally { setActionLoading(null); }
  }

  async function toggleTask(taskId: string, isActive: boolean) {
    await fetch("/api/youtube/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: taskId, isActive }) });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isActive } : t));
  }

  const channelProjects = selectedChannel ? projects.filter(p => p.channelId === selectedChannel) : projects;
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.has(p.status));

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Top Navigation */}
      <header className="border-b border-white/5 bg-[#0d0d15]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center gap-6 h-14">
          <div className="flex items-center gap-2 mr-4">
            <Youtube className="text-red-500 shrink-0" size={22} />
            <span className="font-bold text-white text-sm tracking-wide">YouTube AI Studio</span>
          </div>

          <nav className="flex items-center gap-1">
            {(["dashboard","channels","projects","ideas","memory","automation"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${view === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
                {v}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {activeProjects.length > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
                <Loader2 size={11} className="animate-spin text-blue-400" />
                <span className="text-xs text-blue-400">{activeProjects.length} pipeline{activeProjects.length > 1 ? "s" : ""} running</span>
              </div>
            )}
            <button onClick={fetchAll} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={15} />
            </button>
            <a href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Main App</a>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">

        {/* Channel Selector Bar */}
        {channels.length > 0 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
            <span className="text-xs text-slate-500 shrink-0">Channel:</span>
            <button onClick={() => setSelectedChannel(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedChannel ? "bg-white/10 border-white/20 text-white" : "border-white/5 text-slate-400 hover:border-white/10 hover:text-white"}`}>
              All Channels
            </button>
            {channels.map(ch => (
              <button key={ch.id} onClick={() => setSelectedChannel(ch.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedChannel === ch.id ? "bg-red-500/10 border-red-500/30 text-red-400" : "border-white/5 text-slate-400 hover:border-white/10 hover:text-white"}`}>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${ch.isActive ? "bg-green-400" : "bg-slate-600"}`} />
                  {ch.name}
                </span>
              </button>
            ))}
            <button onClick={() => { setShowCreateChannel(true); setView("channels"); }}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-white/10 text-slate-500 hover:text-white hover:border-white/20 transition-all flex items-center gap-1">
              <Plus size={11} /> New Channel
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-slate-500" size={32} />
          </div>
        ) : (
          <>
            {/* ── DASHBOARD VIEW ─────────────────────────────────────────────── */}
            {view === "dashboard" && (
              <DashboardView
                statusData={statusData}
                channels={channels}
                projects={projects}
                activeProjects={activeProjects}
                onCreateChannel={() => { setShowCreateChannel(true); setView("channels"); }}
                onCreateProject={() => { if (selectedChannel) { setShowCreateProject(true); setView("projects"); } else setView("channels"); }}
                onRunProject={runProject}
                onSelectProject={(id: string) => { setSelectedProjectId(id); setView("projects"); }}
                actionLoading={actionLoading}
              />
            )}

            {/* ── CHANNELS VIEW ──────────────────────────────────────────────── */}
            {view === "channels" && (
              <ChannelsView
                channels={channels}
                selectedChannel={selectedChannel}
                onSelect={setSelectedChannel}
                showCreate={showCreateChannel}
                setShowCreate={setShowCreateChannel}
                newChannel={newChannel}
                setNewChannel={setNewChannel}
                onCreate={createChannel}
                actionLoading={actionLoading}
              />
            )}

            {/* ── PROJECTS VIEW ──────────────────────────────────────────────── */}
            {view === "projects" && (
              selectedProjectId ? (
                <div className="space-y-4">
                  <button
                    onClick={() => setSelectedProjectId(null)}
                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={14} /> Back to projects
                  </button>
                  <YoutubeWorkflow projectId={selectedProjectId} />
                </div>
              ) : (
                <ProjectsView
                  projects={channelProjects}
                  selectedChannel={selectedChannel}
                  showCreate={showCreateProject}
                  setShowCreate={setShowCreateProject}
                  newProject={newProject}
                  setNewProject={setNewProject}
                  onCreate={createProject}
                  onRun={runProject}
                  onDelete={deleteProject}
                  onSelect={setSelectedProjectId}
                  actionLoading={actionLoading}
                />
              )
            )}

            {/* ── IDEAS VIEW ─────────────────────────────────────────────────── */}
            {view === "ideas" && (
              <IdeasView
                ideas={selectedChannel ? ideas : []}
                selectedChannel={selectedChannel}
                channels={channels}
                onSelectChannel={setSelectedChannel}
              />
            )}

            {/* ── MEMORY VIEW ────────────────────────────────────────────────── */}
            {view === "memory" && (
              <MemoryView
                memories={selectedChannel ? memories : []}
                selectedChannel={selectedChannel}
                channels={channels}
                onSelectChannel={setSelectedChannel}
              />
            )}

            {/* ── AUTOMATION VIEW ────────────────────────────────────────────── */}
            {view === "automation" && (
              <AutomationView
                tasks={selectedChannel ? tasks : tasks}
                selectedChannel={selectedChannel}
                channels={channels}
                onCreateTask={createAutomationTask}
                onToggleTask={toggleTask}
                actionLoading={actionLoading}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView({ statusData, channels, projects, activeProjects, onCreateChannel, onCreateProject, onRunProject, onSelectProject, actionLoading }: any) {
  const readyProjects = projects.filter((p: Project) => p.status === "READY_TO_PUBLISH");
  const publishedProjects = projects.filter((p: Project) => p.status === "PUBLISHED");

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Channels", value: statusData?.channels ?? channels.length, icon: Youtube, color: "text-red-400" },
          { label: "Active Pipelines", value: statusData?.activeProjects ?? activeProjects.length, icon: Activity, color: "text-blue-400" },
          { label: "Ready to Publish", value: readyProjects.length, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Published", value: publishedProjects.length, icon: TrendingUp, color: "text-green-400" },
          { label: "Ideas Pool", value: statusData?.totalIdeas ?? 0, icon: Sparkles, color: "text-violet-400" },
          { label: "Memories", value: statusData?.totalMemories ?? 0, icon: Brain, color: "text-cyan-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-white/3 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <stat.icon size={16} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <button onClick={onCreateChannel}
          className="flex items-center gap-4 p-5 bg-gradient-to-br from-red-500/10 to-red-900/5 border border-red-500/20 rounded-xl hover:border-red-500/40 transition-all group text-left">
          <div className="p-3 bg-red-500/10 rounded-xl group-hover:bg-red-500/20 transition-colors">
            <Youtube size={22} className="text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-white">New Channel</p>
            <p className="text-xs text-slate-400 mt-0.5">Set up a YouTube channel identity</p>
          </div>
          <ChevronRight size={16} className="ml-auto text-slate-600 group-hover:text-red-400 transition-colors" />
        </button>

        <button onClick={onCreateProject}
          className="flex items-center gap-4 p-5 bg-gradient-to-br from-violet-500/10 to-violet-900/5 border border-violet-500/20 rounded-xl hover:border-violet-500/40 transition-all group text-left">
          <div className="p-3 bg-violet-500/10 rounded-xl group-hover:bg-violet-500/20 transition-colors">
            <Film size={22} className="text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Generate Video</p>
            <p className="text-xs text-slate-400 mt-0.5">Launch the full AI pipeline</p>
          </div>
          <ChevronRight size={16} className="ml-auto text-slate-600 group-hover:text-violet-400 transition-colors" />
        </button>

        <div className="flex items-center gap-4 p-5 bg-white/3 border border-white/5 rounded-xl text-left">
          <div className="p-3 bg-white/5 rounded-xl">
            <Zap size={22} className="text-yellow-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Auto-Pilot</p>
            <p className="text-xs text-slate-400 mt-0.5">Set frequency in Automation tab</p>
          </div>
        </div>
      </div>

      {/* Active Pipelines */}
      {activeProjects.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            Active Pipelines
          </h2>
          <div className="space-y-2">
            {activeProjects.map((p: Project) => (
              <ProjectCard key={p.id} project={p} onRun={onRunProject} onDelete={() => {}} onSelect={onSelectProject} actionLoading={actionLoading} compact />
            ))}
          </div>
        </div>
      )}

      {/* Ready to Publish */}
      {readyProjects.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-400" />
            Ready to Publish ({readyProjects.length})
          </h2>
          <div className="space-y-2">
            {readyProjects.slice(0, 5).map((p: Project) => (
              <ProjectCard key={p.id} project={p} onRun={onRunProject} onDelete={() => {}} onSelect={onSelectProject} actionLoading={actionLoading} compact />
            ))}
          </div>
        </div>
      )}

      {/* Status Pipeline Breakdown */}
      {statusData && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Pipeline Status Breakdown</h2>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2">
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
              const count = statusData.projectsByStatus?.[status] ?? 0;
              if (count === 0) return null;
              return (
                <div key={status} className={`${cfg.bg} rounded-lg p-3 border border-white/5`}>
                  <p className={`text-lg font-bold ${cfg.color}`}>{count}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{cfg.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Channels View ────────────────────────────────────────────────────────────
function ChannelsView({ channels, selectedChannel, onSelect, showCreate, setShowCreate, newChannel, setNewChannel, onCreate, actionLoading }: any) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">YouTube Channels</h1>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm hover:bg-red-500/20 transition-colors">
          <Plus size={14} /> Add Channel
        </button>
      </div>

      {showCreate && (
        <div className="bg-[#12121e] border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-white flex items-center gap-2"><Youtube size={16} className="text-red-400" /> Create YouTube Channel</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { key: "name", label: "Channel Name", placeholder: "My Cinematic Channel" },
              { key: "niche", label: "Primary Niche", placeholder: "e.g. Philosophy, Self-improvement, History" },
              { key: "subNiche", label: "Sub-niche (optional)", placeholder: "e.g. Stoicism, Productivity" },
              { key: "targetAudience", label: "Target Audience", placeholder: "Who watches this content?" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1.5">{f.label}</label>
                <input value={(newChannel as any)[f.key]} onChange={e => setNewChannel((p: any) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-white/20" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Tone</label>
              <select value={newChannel.tone} onChange={e => setNewChannel((p: any) => ({ ...p, tone: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {["cinematic","educational","motivational","philosophical","documentary","narrative"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Style</label>
              <select value={newChannel.style} onChange={e => setNewChannel((p: any) => ({ ...p, style: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {["metaphorical","narrative","documentary","analytical","symbolic","poetic"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Publish Frequency</label>
              <select value={newChannel.publishFrequency} onChange={e => setNewChannel((p: any) => ({ ...p, publishFrequency: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {["DAILY","TWICE_WEEKLY","WEEKLY","BIWEEKLY"].map(f => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Preferred Duration (minutes)</label>
              <input type="number" min={3} max={60} value={newChannel.preferredDuration}
                onChange={e => setNewChannel((p: any) => ({ ...p, preferredDuration: parseInt(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCreate} disabled={actionLoading === "create-channel" || !newChannel.name || !newChannel.niche}
              className="flex items-center gap-2 px-5 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-sm hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {actionLoading === "create-channel" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Channel
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {channels.length === 0 && !showCreate ? (
        <div className="text-center py-16 text-slate-500">
          <Youtube size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No channels yet</p>
          <p className="text-sm mt-1">Create your first YouTube channel to get started</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch: Channel) => (
            <div key={ch.id} onClick={() => onSelect(ch.id)}
              className={`cursor-pointer p-5 rounded-xl border transition-all ${selectedChannel === ch.id ? "bg-red-500/5 border-red-500/30" : "bg-white/3 border-white/5 hover:border-white/10"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ch.isActive ? "bg-green-400" : "bg-slate-600"}`} />
                    <h3 className="font-semibold text-white">{ch.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{ch.niche}{ch.subNiche ? ` → ${ch.subNiche}` : ""}</p>
                </div>
                <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{ch.publishFrequency}</span>
              </div>
              <div className="flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Film size={10} /> {ch._count?.projects ?? 0} videos</span>
                <span className="flex items-center gap-1"><Sparkles size={10} /> {ch._count?.ideas ?? 0} ideas</span>
                <span className="flex items-center gap-1"><Brain size={10} /> {ch._count?.memories ?? 0} memories</span>
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{ch.tone}</span>
                <span className="bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{ch.style}</span>
                <span className="bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{ch.preferredDuration}min</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Projects View ────────────────────────────────────────────────────────────
function ProjectsView({ projects, selectedChannel, showCreate, setShowCreate, newProject, setNewProject, onCreate, onRun, onDelete, onSelect, actionLoading }: any) {
  const statuses = ["IDEA","RESEARCHING","SCRIPTING","STORYBOARDING","GENERATING_VISUALS","GENERATING_AUDIO","SEO_OPTIMIZATION","QUALITY_CHECK","THUMBNAIL_CREATION","READY_TO_PUBLISH","PUBLISHED","FAILED"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Projects ({projects.length})</h1>
        <button onClick={() => setShowCreate(true)} disabled={!selectedChannel}
          title={!selectedChannel ? "Select a channel first" : ""}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-400 text-sm hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Play size={14} /> Generate Video
        </button>
      </div>

      {showCreate && (
        <div className="bg-[#12121e] border border-violet-500/20 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-white flex items-center gap-2"><Film size={16} className="text-violet-400" /> New Video Generation</h3>
          <p className="text-xs text-slate-400">Leave blank to let the AI find the best trending topic automatically.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Video Concept (optional)</label>
              <textarea value={newProject.concept} onChange={e => setNewProject((p: any) => ({ ...p, concept: e.target.value }))}
                placeholder="Describe the concept... or leave empty for AI to decide"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-white/20 resize-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Working Title (optional)</label>
              <input value={newProject.title} onChange={e => setNewProject((p: any) => ({ ...p, title: e.target.value }))}
                placeholder="Will be generated by AI if empty"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-white/20" />
              <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                <p className="text-xs text-blue-400 font-medium mb-1">Pipeline stages:</p>
                <div className="flex flex-wrap gap-1">
                  {["Trend Research","Niche Psychology","Insight Gen","Metaphor Engine","Script","Storyboard","Visuals","Audio","SEO","QA","Thumbnail"].map(s => (
                    <span key={s} className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCreate} disabled={actionLoading === "create-project"}
              className="flex items-center gap-2 px-5 py-2 bg-violet-500/20 border border-violet-500/40 rounded-lg text-violet-300 text-sm hover:bg-violet-500/30 disabled:opacity-50 transition-colors">
              {actionLoading === "create-project" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Launch Pipeline
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Film size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">{selectedChannel ? "Generate your first video" : "Select a channel to see its projects"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p: Project) => (
            <ProjectCard key={p.id} project={p} onRun={onRun} onDelete={onDelete} onSelect={onSelect} actionLoading={actionLoading} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onRun, onDelete, onSelect, actionLoading, compact }: { project: Project; onRun: (id: string) => void; onDelete: (id: string) => void; onSelect?: (id: string) => void; actionLoading: string | null; compact?: boolean }) {
  const cfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.IDEA;
  const Icon = cfg.icon;
  const isRunning = ACTIVE_STATUSES.has(project.status);

  return (
    <div className={`${cfg.bg} border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all ${onSelect ? "cursor-pointer" : ""}`}
         onClick={onSelect ? () => onSelect(project.id) : undefined}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white/5 shrink-0`}>
          <Icon size={14} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{project.seo?.title ?? project.title ?? project.concept ?? "Generating..."}</p>
              {project.concept && !project.seo?.title && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{project.concept.substring(0, 80)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              <span className={`text-xs px-2 py-0.5 rounded-full border border-white/10 ${cfg.color}`}>{cfg.label}</span>
              {onSelect && (
                <button onClick={() => onSelect(project.id)} title="Open workflow"
                  className="p-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-colors">
                  <WorkflowIcon size={12} />
                </button>
              )}
              {project.status === "FAILED" && (
                <button onClick={() => onRun(project.id)} disabled={actionLoading === `run-${project.id}`}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                  {actionLoading === `run-${project.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                </button>
              )}
              {project.status === "IDEA" && (
                <button onClick={() => onRun(project.id)} disabled={actionLoading === `run-${project.id}`}
                  className="p-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-colors">
                  {actionLoading === `run-${project.id}` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                </button>
              )}
              {!compact && (
                <button onClick={() => onDelete(project.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {isRunning && project.stageProgress > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">{project.currentStage?.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-slate-500">{project.stageProgress}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${cfg.color.replace("text-", "bg-")}`}
                  style={{ width: `${project.stageProgress}%` }} />
              </div>
            </div>
          )}

          {!compact && (
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              {project.script?.retentionScore !== undefined && (
                <span className="flex items-center gap-1"><TrendingUp size={10} /> {project.script.retentionScore}% retention</span>
              )}
              {project.script?.emotionScore !== undefined && (
                <span className="flex items-center gap-1"><Sparkles size={10} /> {project.script.emotionScore}% emotion</span>
              )}
              {project.seo?.ctrPrediction !== undefined && (
                <span className="flex items-center gap-1"><Target size={10} /> {project.seo.ctrPrediction}% CTR</span>
              )}
              {project._count && (
                <span className="flex items-center gap-1"><Image size={10} /> {project._count.assets} assets</span>
              )}
              {project.errorMessage && (
                <span className="text-red-400 truncate max-w-xs">{project.errorMessage.substring(0, 60)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Ideas View ───────────────────────────────────────────────────────────────
function IdeasView({ ideas, selectedChannel, channels, onSelectChannel }: any) {
  if (!selectedChannel) {
    return (
      <div className="text-center py-16 text-slate-500">
        <Sparkles size={40} className="mx-auto mb-4 opacity-30" />
        <p className="font-medium">Select a channel to view its idea pool</p>
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {channels.map((ch: Channel) => (
            <button key={ch.id} onClick={() => onSelectChannel(ch.id)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:border-white/20 transition-colors">
              {ch.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-white flex items-center gap-2">
        <Sparkles size={18} className="text-violet-400" /> Ideas Pool ({ideas.length})
      </h1>
      {ideas.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Sparkles size={40} className="mx-auto mb-4 opacity-30" />
          <p>No ideas yet — run the pipeline to generate ideas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea: Idea) => (
            <div key={idea.id} className="bg-white/3 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white">{idea.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{idea.concept}</p>
                  {idea.hook && <p className="text-xs text-violet-400 mt-2 italic">"{idea.hook}"</p>}
                </div>
                <div className="shrink-0 flex flex-col gap-1 items-end">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    idea.status === "NEW" ? "bg-slate-800 text-slate-400" :
                    idea.status === "IN_PROGRESS" ? "bg-blue-900 text-blue-400" :
                    "bg-green-900 text-green-400"
                  }`}>{idea.status}</span>
                </div>
              </div>
              <div className="flex gap-4 mt-3 text-xs">
                <ScorePill label="Trend" value={idea.trendScore} color="text-blue-400" />
                <ScorePill label="Viral" value={idea.viralityScore} color="text-pink-400" />
                <ScorePill label="Opportunity" value={idea.opportunityScore} color="text-emerald-400" />
                <ScorePill label="Competition" value={100 - idea.competitionScore} color="text-orange-400" invert />
              </div>
              {idea.targetEmotion && (
                <div className="mt-2 flex gap-2">
                  <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{idea.targetEmotion}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, value, color, invert }: { label: string; value: number; color: string; invert?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-600">{label}:</span>
      <span className={`font-semibold ${color}`}>{Math.round(value)}</span>
    </div>
  );
}

// ─── Memory View ──────────────────────────────────────────────────────────────
function MemoryView({ memories, selectedChannel, channels, onSelectChannel }: any) {
  const grouped = memories.reduce((acc: Record<string, Memory[]>, m: Memory) => {
    if (!acc[m.type]) acc[m.type] = [];
    acc[m.type].push(m);
    return acc;
  }, {} as Record<string, Memory[]>);

  if (!selectedChannel) {
    return (
      <div className="text-center py-16 text-slate-500">
        <Brain size={40} className="mx-auto mb-4 opacity-30" />
        <p className="font-medium">Select a channel to view its memories</p>
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {channels.map((ch: Channel) => (
            <button key={ch.id} onClick={() => onSelectChannel(ch.id)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:border-white/20 transition-colors">
              {ch.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    HOOK: "text-yellow-400", STYLE: "text-blue-400", METAPHOR: "text-violet-400",
    THUMBNAIL: "text-pink-400", PACING: "text-orange-400", AUDIENCE: "text-cyan-400",
    VISUAL: "text-emerald-400", SEO: "text-green-400",
  };

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-white flex items-center gap-2">
        <Brain size={18} className="text-cyan-400" /> Channel Memory ({memories.length} entries)
      </h1>
      <p className="text-sm text-slate-400">Learnings extracted from past videos. Higher confidence = more reliable pattern.</p>

      {memories.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Database size={40} className="mx-auto mb-4 opacity-30" />
          <p>No memories yet — memories are stored after each completed video</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, mems]) => (
            <div key={type}>
              <h2 className={`text-sm font-semibold mb-3 ${typeColors[type] ?? "text-slate-300"}`}>{type}</h2>
              <div className="space-y-2">
                {(mems as Memory[]).map((m: Memory) => (
                  <div key={m.id} className="bg-white/3 border border-white/5 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-300">{m.key}</p>
                        <p className="text-sm text-slate-400 mt-0.5">{m.value}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-slate-500">Confidence</div>
                        <div className={`text-sm font-semibold ${m.confidence > 0.7 ? "text-emerald-400" : m.confidence > 0.4 ? "text-yellow-400" : "text-slate-400"}`}>
                          {Math.round(m.confidence * 100)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500/50 rounded-full" style={{ width: `${m.confidence * 100}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-slate-600">Used {m.usageCount} time{m.usageCount !== 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Automation View ──────────────────────────────────────────────────────────
function AutomationView({ tasks, selectedChannel, channels, onCreateTask, onToggleTask, actionLoading }: any) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap size={18} className="text-yellow-400" /> Automation Tasks
        </h1>
        <button onClick={onCreateTask} disabled={!selectedChannel || actionLoading === "create-task"}
          title={!selectedChannel ? "Select a channel first" : ""}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm hover:bg-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {actionLoading === "create-task" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Enable Auto-Pilot
        </button>
      </div>

      <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4">
        <p className="text-sm text-yellow-200/70 font-medium mb-1">How Auto-Pilot Works</p>
        <p className="text-xs text-slate-400">Once enabled for a channel, the AI system automatically finds trending topics, generates complete videos (script → visuals → audio → SEO), and queues them for your review. No input required from you.</p>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Zap size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No automation tasks</p>
          <p className="text-sm mt-1">{selectedChannel ? "Enable Auto-Pilot to start generating videos automatically" : "Select a channel first"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: AutoTask) => (
            <div key={task.id} className="bg-white/3 border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{task.channel?.name ?? "Channel"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{task.frequency} • {task.requireApproval ? "Requires approval" : "Auto-publish"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-slate-500">
                    {task.lastRun && <p>Last: {new Date(task.lastRun).toLocaleDateString()}</p>}
                    {task.nextRun && <p>Next: {new Date(task.nextRun).toLocaleDateString()}</p>}
                  </div>
                  <button onClick={() => onToggleTask(task.id, !task.isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${task.isActive ? "bg-green-500" : "bg-slate-700"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${task.isActive ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
