'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Globe,
  Target,
  User,
  Users,
  UserPlus,
  Bot,
  X,
  Edit2,
  MessageSquare,
  Layout,
  Image as ImageIcon,
  Link as LinkIcon,
  Hash,
  Search,
  Loader2,
  Copy,
  Check,
  ChevronRight,
  Zap,
  Clock,
  ArrowRight,
  Key,
  Menu,
  Settings,
  Plus,
  BarChart3,
  BookOpen,
  Monitor,
  ShieldCheck,
  Camera,
  Trash2,
  Eye,
  TrendingUp,
  ExternalLink,
  ChevronDown,
  Workflow,
  Sparkles,
  FileSearch,
  PenTool,
  Wand2,
  Radio,
  Activity,
  Github,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateAutomatedContent, regenerateSection, refineContent } from '@/services/geminiService';
import { GenerationResult } from '@/lib/types';
import Canvas from '@/components/workflow/Canvas';

type Stage = 'idle' | 'crawl' | 'extract' | 'write' | 'refine' | 'done' | 'error';

interface CrawledPageMeta { url: string; title: string; words: number }

interface PipelineProgress {
  stage: Stage;
  message?: string;
  crawl?: { totalPages: number; totalWords: number; pages: CrawledPageMeta[] };
  models?: { extract: string; write: string; refine: string; writeCompare?: string };
}

interface ModelSelection {
  extract: string;
  write: string;
  refine: string;
  image: string;
  video: string;
  writeCompare?: string;
}

interface ModelCatalog {
  catalog: Record<'extract' | 'write' | 'refine' | 'image' | 'video', Array<{ id: string; label: string; description: string; badges?: string[]; context?: string }>>;
  defaults: Record<'extract' | 'write' | 'refine' | 'image' | 'video', string>;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('Professional & Informative');
  const [existingPosts, setExistingPosts] = useState('');
  const [tables, setTables] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'preview' | 'insights' | 'crawl'>('preview');
  const [appMode, setAppMode] = useState<'manual' | 'automation' | 'settings' | 'history' | 'teams'>('manual');
  const [automationTasks, setAutomationTasks] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [scheduleType, setScheduleType] = useState<'INTERVAL' | 'DAILY'>('INTERVAL');
  const [intervalHours, setIntervalHours] = useState(12);
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [publicationLeadTime, setPublicationLeadTime] = useState(0);
  const [generationBufferMins, setGenerationBufferMins] = useState(30);
  const [maxPages, setMaxPages] = useState(30);

  const [isCommitting, setIsCommitting] = useState(false);
  const [dbStatus, setDbStatus] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const [progress, setProgress] = useState<PipelineProgress>({ stage: 'idle' });
  const [pipelineResult, setPipelineResult] = useState<any>(null);

  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [models, setModels] = useState<ModelSelection>({
    extract: 'Qwen/Qwen2.5-72B-Instruct',
    write: 'meta-llama/Llama-3.3-70B-Instruct',
    refine: 'deepseek-ai/DeepSeek-V3',
    image: 'black-forest-labs/FLUX.1-schnell',
    video: 'Lightricks/LTX-Video',
    writeCompare: undefined,
  });

  useEffect(() => {
    const initializeSystem = async () => {
      loadAutomationTasks();
      loadArchives();
      loadTeams();
      try {
        const [dResp, mResp] = await Promise.all([fetch('/api/diagnostics'), fetch('/api/models')]);
        if (dResp.ok) {
          const dData = await dResp.json();
          setHasApiKey(dData.engine_status === 'STABLE');
        }
        if (mResp.ok) {
          const mData = await mResp.json();
          setModelCatalog(mData);
          setModels((m) => ({
            ...m,
            extract: mData.defaults.extract,
            write: mData.defaults.write,
            refine: mData.defaults.refine,
            image: mData.defaults.image,
            video: mData.defaults.video,
          }));
        }
      } catch (e) {
        console.error("Initial diagnostics failed");
      }
    };
    initializeSystem();
  }, []);

  const loadArchives = async () => {
    setIsFetchingPosts(true);
    try {
      const resp = await fetch('/api/posts');
      if (resp.ok) {
        const data = await resp.json();
        setPosts(data);
      }
    } catch (err) {
      console.error("Failed to fetch posts");
    } finally {
      setIsFetchingPosts(false);
    }
  };

  const loadAutomationTasks = async () => {
    try {
      const resp = await fetch('/api/automation-tasks');
      if (resp.ok) {
        const data = await resp.json();
        setAutomationTasks(data);
      }
    } catch (err) {
      console.error("Failed to fetch automation tasks");
    }
  };

  const loadTeams = async () => {
    try {
      const resp = await fetch('/api/teams');
      if (resp.ok) setTeams(await resp.json());
    } catch (err) {
      console.error("Failed to fetch teams");
    }
  };

  const handleCreateAutomationTask = async () => {
    if (!niche || !audience) {
      setError('Niche and Audience are required for automation');
      return;
    }
    setIsCreatingTask(true);
    try {
      const resp = await fetch('/api/automation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche,
          category: tables || niche,
          products: existingPosts || 'N/A',
          target_url: url,
          audience,
          tone,
          posts_per_day: postsPerDay,
          schedule_type: scheduleType,
          interval_hours: intervalHours,
          schedule_time: scheduleTime,
          days_of_week: selectedDays.join(','),
          publication_lead_time_hours: publicationLeadTime,
          generation_buffer_minutes: generationBufferMins
        })
      });
      if (resp.ok) {
        setDbStatus("AUTOMATION_TASK: ACTIVATED");
        loadAutomationTasks();
        setAppMode('automation');
      }
    } catch (err) {
      setError("Failed to initialize automation task");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleRunTaskManually = async (id: number) => {
    try {
      const resp = await fetch(`/api/automation-tasks/${id}/run`, { method: 'POST' });
      if (resp.ok) {
        alert("Automation cycle triggered successfully!");
        loadAutomationTasks();
      } else {
        const data = await resp.json().catch(() => ({}));
        let msg = data.error || "Manual trigger failed";
        if (resp.status === 402 || msg.includes("depleted") || msg.includes("CREDITS_DEPLETED")) {
          msg = "HF credits depleted — top up at huggingface.co/settings/billing or upgrade to PRO. You can also add tokens from a different HF account in Settings → Token Pool.";
        }
        setError(msg);
        alert(msg);
      }
    } catch (err) {
      setError("Failed to communicate with automation engine");
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("Decompose this automation node?")) return;
    try {
      const resp = await fetch(`/api/automation-tasks/${id}`, { method: 'DELETE' });
      if (resp.ok) loadAutomationTasks();
    } catch (err) {
      setError("Failed to delete automation cycle");
    }
  };

  const handleSelectKey = () => setAppMode('settings');

  // ----- Advanced multi-model pipeline (SSE) -----
  const handleGenerateAdvanced = async () => {
    if (!url) {
      setError('Target URL is required');
      return;
    }
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setPipelineResult(null);
    setProgress({ stage: 'crawl', message: 'Crawling site…' });
    setCurrentStep(2);

    try {
      const resp = await fetch('/api/generate-advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url, niche, audience, tone, existingPosts, tables, maxPages,
          models: {
            extract: models.extract,
            write: models.write,
            refine: models.refine,
            writeCompare: models.writeCompare,
          },
        }),
      });
      if (!resp.ok || !resp.body) throw new Error('Pipeline request failed');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event:'));
          const dataLine = lines.find((l) => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;
          const eventName = eventLine.replace('event:', '').trim();
          const payload = JSON.parse(dataLine.replace('data:', '').trim());

          if (eventName === 'status') {
            if (payload.stage === 'crawl' && payload.status === 'done') {
              setProgress((p) => ({
                ...p,
                stage: 'extract',
                models: payload.models || p.models,
                crawl: { totalPages: payload.totalPages, totalWords: payload.totalWords, pages: payload.pages || [] },
              }));
            } else if (payload.status === 'start') {
              setProgress((p) => ({ ...p, stage: payload.stage as Stage, models: payload.models || p.models }));
            }
          } else if (eventName === 'result') {
            setPipelineResult(payload);
            setResult(payload.refined || payload.article);
            setProgress((p) => ({ ...p, stage: 'done' }));
            setCurrentStep(3);
          } else if (eventName === 'error') {
            throw new Error(payload.message || 'Pipeline error');
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline failed');
      setProgress({ stage: 'error' });
      setCurrentStep(1);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = async () => {
    if (!result) return;
    setIsCommitting(true);
    setError(null);
    try {
      const resp = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!resp.ok) throw new Error('Failed to commit to database');
      const data = await resp.json();
      setDbStatus(`SUCCESS: Record saved with ID ${data.id}`);
      setCurrentStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database error');
    } finally {
      setIsCommitting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDeletePost = async (id: number) => {
    if (!confirm("Delete this archive record?")) return;
    try {
      const resp = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (resp.ok) loadArchives();
    } catch (err) {
      console.error("Failed to delete post");
    }
  };

  return (
    <div className="min-h-screen w-full text-[color:var(--color-fg-1)] font-sans">
      <TopNav appMode={appMode} setAppMode={setAppMode} hasApiKey={hasApiKey} onSettings={handleSelectKey} />

      <main className="relative">
        <AnimatePresence mode="wait">
          {appMode === 'manual' && (
            <motion.div
              key="manual"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <AnimatePresence mode="wait">
                {currentStep === 1 && (
                  <motion.div
                    key="step-config"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Canvas
                      modelCatalog={modelCatalog}
                      hasApiKey={hasApiKey}
                      onConnectKey={handleSelectKey}
                      onResult={(payload) => {
                        setPipelineResult(payload);
                        setResult(payload.refined || payload.article);
                        setCurrentStep(3);
                      }}
                    />
                  </motion.div>
                )}

                {currentStep === 2 && (
                  <motion.div
                    key="step-loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="min-h-[80vh] flex items-center justify-center px-6 py-16"
                  >
                    <PipelineRunner progress={progress} />
                  </motion.div>
                )}

                {currentStep === 3 && result && (
                  <motion.div
                    key="step-review"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="min-h-screen"
                  >
                    <ResultsHeader
                      activeView={activeView}
                      setActiveView={setActiveView}
                      onBack={() => setCurrentStep(1)}
                      onCommit={handleCommit}
                      isCommitting={isCommitting}
                      models={pipelineResult?.models}
                      meta={pipelineResult?.meta}
                    />
                    <div className="max-w-7xl mx-auto px-6 py-10">
                      <AnimatePresence mode="wait">
                        {activeView === 'preview' && (
                          <motion.div key="v-preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                            <ArticlePreview result={result} onResultChange={setResult} imageModel={models.image} videoModel={models.video} />
                          </motion.div>
                        )}
                        {activeView === 'insights' && pipelineResult?.insights && (
                          <motion.div key="v-insights" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                            <InsightsView insights={pipelineResult.insights} />
                          </motion.div>
                        )}
                        {activeView === 'crawl' && progress.crawl && (
                          <motion.div key="v-crawl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                            <CrawlReport crawl={progress.crawl} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {currentStep === 4 && (
                  <motion.div
                    key="step-success"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="min-h-[70vh] flex flex-col items-center justify-center p-12 space-y-8"
                  >
                    <div className="w-20 h-20 rounded-full flex items-center justify-center pulse-glow" style={{ background: 'linear-gradient(135deg, #ff6d5a, #ea4b71)' }}>
                      <Check className="w-10 h-10 text-white" strokeWidth={3} />
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-3xl font-display font-bold tracking-tight gradient-text">Archived to Database</h2>
                      <p className="text-[color:var(--color-fg-2)]">Your content has been saved. {dbStatus}</p>
                    </div>
                    <button onClick={() => { setCurrentStep(1); setUrl(''); setResult(null); }} className="btn-primary px-12">New Workflow</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {appMode === 'automation' && (
            <motion.div key="automation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12">
              <AutomationHub
                tasks={automationTasks}
                teams={teams}
                onRun={handleRunTaskManually}
                onDelete={handleDeleteTask}
                onNew={() => { setAppMode('manual'); setCurrentStep(1); }}
                onTasksRefresh={loadAutomationTasks}
                onManageTeams={() => setAppMode('teams')}
              />
            </motion.div>
          )}

          {appMode === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12">
              <ArchiveView
                posts={posts}
                isLoading={isFetchingPosts}
                onDelete={handleDeletePost}
                onRefresh={loadArchives}
                onView={(post) => {
                  setResult({
                    post: { ...post, featured_image_url: post.featured_image_url || null, reading_time: post.reading_time || "5" } as any,
                    sections: post.sections || [],
                    images: (post.images || []).map((img: any) => ({ ...img, image_url: img.url })),
                    internal_links: post.internal_links || [],
                    keywords: post.keywords || [],
                    categories: post.categories || [],
                    products: post.products || []
                  });
                  setAppMode('manual');
                  setCurrentStep(3);
                }}
              />
            </motion.div>
          )}

          {appMode === 'teams' && (
            <motion.div key="teams" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12">
              <TeamsView
                teams={teams}
                tasks={automationTasks}
                onRefresh={() => { loadTeams(); loadAutomationTasks(); }}
              />
            </motion.div>
          )}

          {appMode === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12">
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SiteFooter isGenerating={isGenerating} isCommitting={isCommitting} />
    </div>
  );
}

/* ============================ TOP NAV (n8n-style) ============================ */

function TopNav({ appMode, setAppMode, hasApiKey, onSettings }: { appMode: string; setAppMode: (m: any) => void; hasApiKey: boolean | null; onSettings: () => void; }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[color:var(--color-bg-0)]/70 border-b border-[color:var(--color-line)]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <button onClick={() => setAppMode('manual')} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ff6d5a, #ea4b71)' }}>
              <Workflow className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-white tracking-tight text-base">ContentArchitect</span>
            <span className="chip text-[10px] font-mono">v3.0</span>
          </button>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink active={appMode === 'manual'} onClick={() => setAppMode('manual')} icon={<Sparkles className="w-3.5 h-3.5" />}>Workflow</NavLink>
            <NavLink active={appMode === 'automation'} onClick={() => setAppMode('automation')} icon={<Zap className="w-3.5 h-3.5" />}>Automations</NavLink>
            <NavLink active={appMode === 'teams'} onClick={() => setAppMode('teams')} icon={<Users className="w-3.5 h-3.5" />}>Teams</NavLink>
            <NavLink active={appMode === 'history'} onClick={() => setAppMode('history')} icon={<BookOpen className="w-3.5 h-3.5" />}>Archive</NavLink>
            <NavLink active={appMode === 'settings'} onClick={onSettings} icon={<Settings className="w-3.5 h-3.5" />}>Settings</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full surface-2 border-[color:var(--color-line)]">
            <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[color:var(--color-fg-2)]">{hasApiKey ? 'HF Online' : 'Connect Token'}</span>
          </div>
          <button onClick={onSettings} className="btn-secondary py-2 px-4 text-xs">
            <Key className="w-3.5 h-3.5" /> Tokens
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${active ? 'bg-[color:var(--color-bg-2)] text-white' : 'text-[color:var(--color-fg-2)] hover:text-white hover:bg-[color:var(--color-bg-2)]/60'}`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============================ HERO ============================ */

function HeroSection(props: {
  url: string; setUrl: (v: string) => void;
  niche: string; setNiche: (v: string) => void;
  audience: string; setAudience: (v: string) => void;
  tone: string; setTone: (v: string) => void;
  existingPosts: string; setExistingPosts: (v: string) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  onGenerate: () => void; isGenerating: boolean;
  hasApiKey: boolean | null;
  onConnectKey: () => void;
  error: string | null;
  modelCatalog: ModelCatalog | null;
  models: ModelSelection;
  setModels: React.Dispatch<React.SetStateAction<ModelSelection>>;
}) {
  const { url, setUrl, niche, setNiche, audience, setAudience, tone, setTone, existingPosts, setExistingPosts, maxPages, setMaxPages, onGenerate, isGenerating, hasApiKey, onConnectKey, error, modelCatalog, models, setModels } = props;

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(900px 500px at 80% 10%, rgba(255,109,90,0.10), transparent 60%)',
      }} />

      <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 chip-brand">
              <Sparkles className="w-3 h-3" />
              <span>Multi-model AI pipeline · Qwen → Llama → DeepSeek</span>
            </div>

            <div className="space-y-5">
              <h1 className="font-display font-bold tracking-[-0.02em] text-5xl md:text-6xl lg:text-7xl leading-[1.05] text-white">
                Crawl any site.{' '}
                <span className="gradient-text">Generate flawless content.</span>
              </h1>
              <p className="text-lg text-[color:var(--color-fg-2)] max-w-xl leading-relaxed">
                Feed a URL. We crawl every page, extract intelligence with one model, write with another, and refine for SEO with a third — all in one click.
              </p>
            </div>

            <div className="gradient-border p-1.5">
              <div className="surface-2 rounded-2xl p-2 flex items-center gap-2">
                <div className="pl-3 text-[color:var(--color-fg-3)]"><Globe className="w-5 h-5" /></div>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-[color:var(--color-fg-3)] py-3 px-2 text-base font-mono"
                />
                <button
                  onClick={onGenerate}
                  disabled={isGenerating || !url}
                  className="btn-primary py-3 px-6 text-sm"
                >
                  {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><Wand2 className="w-4 h-4" /> Generate</>}
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <InputCard icon={<Target className="w-3.5 h-3.5" />} label="Niche / Topic" placeholder="e.g. ESG Investing" value={niche} onChange={setNiche} />
              <InputCard icon={<User className="w-3.5 h-3.5" />} label="Target Audience" placeholder="e.g. Retail Investors" value={audience} onChange={setAudience} />
              <InputCard icon={<MessageSquare className="w-3.5 h-3.5" />} label="Tone" placeholder="e.g. Authoritative & Concise" value={tone} onChange={setTone} />
              <div className="space-y-1.5">
                <label className="micro-label block px-1">Crawl Depth · Max Pages</label>
                <div className="surface-2 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <FileSearch className="w-3.5 h-3.5 text-[color:var(--color-fg-2)]" />
                  <input type="range" min={5} max={60} value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value))} className="flex-1 accent-[#ff6d5a]" />
                  <span className="font-mono text-xs text-white w-10 text-right">{maxPages}</span>
                </div>
              </div>
            </div>

            <ModelPickerPanel modelCatalog={modelCatalog} models={models} setModels={setModels} />

            <div className="space-y-1.5">
              <label className="micro-label block px-1">Constraints / Keywords (optional)</label>
              <textarea
                className="glass-input w-full min-h-[90px] font-mono text-[12px]"
                placeholder="Phrases to include or avoid; competitor names; brand voice notes…"
                value={existingPosts}
                onChange={(e) => setExistingPosts(e.target.value)}
              />
            </div>

            {!hasApiKey && (
              <button onClick={onConnectKey} className="text-xs font-bold text-[#ff8b6e] hover:text-white transition-colors uppercase tracking-widest flex items-center gap-2">
                <Key className="w-3 h-3" /> Connect Hugging Face Token →
              </button>
            )}

            {error && (
              <div className="surface-2 border border-red-500/30 bg-red-500/5 px-4 py-3 rounded-xl text-red-300 text-sm flex items-start gap-3">
                <Radio className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-red-200 mb-0.5">System Error</div>
                  <div className="text-red-300/90">{error}</div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5">
            <PipelineVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelPickerPanel({ modelCatalog, models, setModels }: { modelCatalog: ModelCatalog | null; models: ModelSelection; setModels: React.Dispatch<React.SetStateAction<ModelSelection>>; }) {
  const [open, setOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  if (!modelCatalog) {
    return (
      <div className="surface-2 px-4 py-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[color:var(--color-fg-2)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading model catalog…
        </div>
      </div>
    );
  }

  return (
    <div className="surface-2 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-[color:var(--color-bg-3)] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,109,90,0.12)', border: '1px solid rgba(255,109,90,0.3)' }}>
            <Sparkles className="w-4 h-4 text-[#ff8b6e]" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Model Picker</div>
            <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">Choose a specialized model per stage</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">{[models.extract, models.write, models.refine].map((m) => m.split('/').pop()?.split('-')[0]).join(' · ')}</span>
          <ChevronDown className={`w-4 h-4 text-[color:var(--color-fg-2)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[color:var(--color-line)]"
          >
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <ModelSelect label="Extraction" icon={<FileSearch className="w-3.5 h-3.5" />} options={modelCatalog.catalog.extract} value={models.extract} onChange={(v) => setModels((m) => ({ ...m, extract: v }))} />
              <ModelSelect label="Writing" icon={<PenTool className="w-3.5 h-3.5" />} options={modelCatalog.catalog.write} value={models.write} onChange={(v) => setModels((m) => ({ ...m, write: v }))} />
              <ModelSelect label="SEO Refine" icon={<Wand2 className="w-3.5 h-3.5" />} options={modelCatalog.catalog.refine} value={models.refine} onChange={(v) => setModels((m) => ({ ...m, refine: v }))} />
              <ModelSelect label="Image" icon={<ImageIcon className="w-3.5 h-3.5" />} options={modelCatalog.catalog.image} value={models.image} onChange={(v) => setModels((m) => ({ ...m, image: v }))} />
              <ModelSelect label="Video" icon={<Camera className="w-3.5 h-3.5" />} options={modelCatalog.catalog.video} value={models.video} onChange={(v) => setModels((m) => ({ ...m, video: v }))} />
              <div className="space-y-1.5">
                <label className="micro-label flex items-center gap-1.5"><Activity className="w-3 h-3" /> Compare Writer (optional)</label>
                <button onClick={() => setCompareOpen((c) => !c)} className="surface px-3 py-2.5 rounded-xl w-full text-left text-xs text-[color:var(--color-fg-1)] hover:border-[color:var(--color-line-2)] transition-colors flex items-center justify-between">
                  <span>{models.writeCompare ? modelCatalog.catalog.write.find((m) => m.id === models.writeCompare)?.label || models.writeCompare : 'None — single writer'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${compareOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {compareOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="surface rounded-xl p-2 space-y-1 mt-1">
                        <button onClick={() => { setModels((m) => ({ ...m, writeCompare: undefined })); setCompareOpen(false); }} className="w-full text-left px-2 py-1.5 rounded text-xs text-[color:var(--color-fg-2)] hover:bg-[color:var(--color-bg-3)]">None</button>
                        {modelCatalog.catalog.write.filter((m) => m.id !== models.write).map((m) => (
                          <button key={m.id} onClick={() => { setModels((s) => ({ ...s, writeCompare: m.id })); setCompareOpen(false); }} className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[color:var(--color-bg-3)] ${models.writeCompare === m.id ? 'text-[#ff8b6e]' : 'text-white'}`}>
                            <div className="font-semibold">{m.label}</div>
                            <div className="text-[10px] font-mono text-[color:var(--color-fg-2)]">{m.id}</div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <p className="text-[10px] text-[color:var(--color-fg-2)]">Runs a second writer in parallel for side-by-side comparison.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModelSelect({ label, icon, options, value, onChange }: { label: string; icon: React.ReactNode; options: ModelCatalog['catalog']['extract']; value: string; onChange: (v: string) => void; }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="space-y-1.5 relative">
      <label className="micro-label flex items-center gap-1.5">{icon}{label}</label>
      <button onClick={() => setOpen((o) => !o)} className="surface px-3 py-2.5 rounded-xl w-full text-left hover:border-[color:var(--color-line-2)] transition-colors flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{current?.label || value.split('/').pop()}</div>
          <div className="text-[10px] font-mono text-[color:var(--color-fg-2)] truncate">{value}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-[color:var(--color-fg-2)] transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-30 top-full mt-1.5 left-0 right-0 surface rounded-xl p-1.5 space-y-0.5 max-h-72 overflow-y-auto custom-scrollbar shadow-2xl">
            {options.map((m) => (
              <button key={m.id} onClick={() => { onChange(m.id); setOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg hover:bg-[color:var(--color-bg-3)] transition-colors ${value === m.id ? 'bg-[color:var(--color-bg-3)] ring-1 ring-[#ff6d5a]/40' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{m.label}</div>
                  <div className="flex gap-1">
                    {(m.badges || []).slice(0, 2).map((b) => (
                      <span key={b} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${b === 'Recommended' ? 'bg-[rgba(255,109,90,0.15)] text-[#ff8b6e] border border-[rgba(255,109,90,0.3)]' : 'bg-[color:var(--color-bg-2)] text-[color:var(--color-fg-2)] border border-[color:var(--color-line)]'}`}>{b}</span>
                    ))}
                  </div>
                </div>
                <div className="text-[11px] text-[color:var(--color-fg-2)] mt-0.5">{m.description}</div>
                <div className="text-[10px] font-mono text-[color:var(--color-fg-3)] mt-0.5">{m.id}</div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputCard({ icon, label, placeholder, value, onChange }: { icon: React.ReactNode; label: string; placeholder: string; value: string; onChange: (v: string) => void; }) {
  return (
    <div className="space-y-1.5">
      <label className="micro-label block px-1">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-fg-2)]">{icon}</div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="glass-input w-full pl-9"
        />
      </div>
    </div>
  );
}

function PipelineVisual() {
  const stages = [
    { name: 'Crawl', model: 'Site → DOM', icon: <Globe className="w-4 h-4" />, color: '#ff6d5a' },
    { name: 'Extract', model: 'Qwen 2.5 · 72B', icon: <FileSearch className="w-4 h-4" />, color: '#ea4b71' },
    { name: 'Write', model: 'Llama 3.3 · 70B', icon: <PenTool className="w-4 h-4" />, color: '#ff8b4a' },
    { name: 'SEO Refine', model: 'DeepSeek V3', icon: <Wand2 className="w-4 h-4" />, color: '#ff6d5a' },
  ];
  return (
    <div className="surface-2 rounded-3xl p-6 relative overflow-hidden">
      <div className="absolute inset-0 dot-bg opacity-50 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div className="micro-label">Pipeline · 4 stages</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-[color:var(--color-fg-2)]">READY</span>
          </div>
        </div>

        <div className="space-y-3">
          {stages.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3 relative">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${s.color}33, ${s.color}11)`, border: `1px solid ${s.color}55` }}>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div className="flex-1 surface rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{s.name}</div>
                  <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">{s.model}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-[color:var(--color-fg-3)]" />
              </div>
              {i < stages.length - 1 && (
                <div className="absolute left-5 top-10 w-px h-3" style={{ background: 'linear-gradient(180deg, #ff6d5a, transparent)' }} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-[color:var(--color-line)] grid grid-cols-3 gap-3">
          <Stat label="Sources" value="Multi-page" />
          <Stat label="Models" value="3 specialized" />
          <Stat label="Output" value="SEO-ready" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="micro-label mb-1">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

/* ============================ PIPELINE SHOWCASE STRIP ============================ */

function PipelineShowcase() {
  const features = [
    { icon: <Globe className="w-5 h-5" />, title: 'Sitemap-aware crawler', desc: 'Discovers /sitemap.xml, then expands via on-page links. Same-origin, dedup, parallel fetch.' },
    { icon: <FileSearch className="w-5 h-5" />, title: 'Structured extraction', desc: 'Qwen 2.5-72B reads the whole corpus and emits topics, entities, key facts, keywords, gaps.' },
    { icon: <PenTool className="w-5 h-5" />, title: 'Long-form writing', desc: 'Llama 3.3-70B drafts 8–12 sections grounded in extracted facts and target keywords.' },
    { icon: <Wand2 className="w-5 h-5" />, title: 'SEO refinement', desc: 'DeepSeek-V3 polishes meta, headings, alt text, anchors and appends an FAQ section.' },
  ];
  return (
    <section className="relative border-t border-[color:var(--color-line)]">
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
          <div className="neural-label">How it works</div>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
            One URL in. <span className="gradient-text">A complete article out.</span>
          </h2>
          <p className="text-[color:var(--color-fg-2)]">Every step uses the model best suited for the job, not a one-size-fits-all generalist.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="surface p-6 hover:border-[color:var(--color-line-2)] transition-colors group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,109,90,0.12)', border: '1px solid rgba(255,109,90,0.3)' }}>
                <span className="text-[#ff8b6e]">{f.icon}</span>
              </div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-[color:var(--color-fg-2)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================ AUTOMATION PANEL ============================ */

function AutomationPanel(props: {
  scheduleType: 'INTERVAL' | 'DAILY'; setScheduleType: (v: 'INTERVAL' | 'DAILY') => void;
  intervalHours: number; setIntervalHours: (n: number) => void;
  scheduleTime: string; setScheduleTime: (v: string) => void;
  selectedDays: number[]; setSelectedDays: (d: number[]) => void;
  publicationLeadTime: number; setPublicationLeadTime: (n: number) => void;
  generationBufferMins: number; setGenerationBufferMins: (n: number) => void;
  onActivate: () => void; isCreating: boolean; canActivate: boolean;
}) {
  const { scheduleType, setScheduleType, intervalHours, setIntervalHours, scheduleTime, setScheduleTime, selectedDays, setSelectedDays, publicationLeadTime, setPublicationLeadTime, generationBufferMins, setGenerationBufferMins, onActivate, isCreating, canActivate } = props;

  return (
    <section className="border-t border-[color:var(--color-line)] bg-[color:var(--color-bg-1)]/40">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4 space-y-3">
            <div className="neural-label">Automation</div>
            <h2 className="text-3xl font-display font-bold text-white">Schedule recurring runs</h2>
            <p className="text-[color:var(--color-fg-2)]">Set a cadence and the pipeline will fire on its own — interval-based or at a fixed daily time.</p>
          </div>

          <div className="lg:col-span-8 surface p-6 space-y-6">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setScheduleType('INTERVAL')}
                className={`px-4 py-3 rounded-xl flex flex-col items-start gap-1 transition-all ${scheduleType === 'INTERVAL' ? 'surface-2 ring-2 ring-[#ff6d5a]/50' : 'surface-2 opacity-60 hover:opacity-100'}`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-[#ff8b6e]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white">Interval</span>
                </div>
                <span className="text-[10px] text-[color:var(--color-fg-2)]">Every X hours</span>
              </button>
              <button
                onClick={() => setScheduleType('DAILY')}
                className={`px-4 py-3 rounded-xl flex flex-col items-start gap-1 transition-all ${scheduleType === 'DAILY' ? 'surface-2 ring-2 ring-[#ff6d5a]/50' : 'surface-2 opacity-60 hover:opacity-100'}`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[#ff8b6e]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white">Daily</span>
                </div>
                <span className="text-[10px] text-[color:var(--color-fg-2)]">At specific time</span>
              </button>
            </div>

            <div className="surface-2 p-4 rounded-2xl">
              {scheduleType === 'INTERVAL' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center micro-label">
                    <span>Recurrence</span>
                    <span className="text-[#ff8b6e]">Every {intervalHours} hours</span>
                  </div>
                  <div className="flex gap-2">
                    {[4, 6, 8, 12, 24].map(val => (
                      <button key={val} onClick={() => setIntervalHours(val)} className={`flex-1 h-9 rounded-lg text-[10px] font-bold transition-all ${intervalHours === val ? 'text-white' : 'text-[color:var(--color-fg-2)] surface'} `} style={intervalHours === val ? { background: 'linear-gradient(135deg, #ff6d5a, #ea4b71)' } : undefined}>{val}h</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center micro-label">
                    <span>Execution time</span>
                    <span className="text-[#ff8b6e]">Daily at {scheduleTime}</span>
                  </div>
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="glass-input w-full" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="micro-label">Active Days</label>
              <div className="flex gap-1.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (selectedDays.includes(i)) setSelectedDays(selectedDays.filter(d => d !== i));
                      else setSelectedDays([...selectedDays, i].sort());
                    }}
                    className={`w-9 h-9 rounded-lg text-[11px] font-bold transition-all ${selectedDays.includes(i) ? 'text-white' : 'text-[color:var(--color-fg-2)] surface-2'}`}
                    style={selectedDays.includes(i) ? { background: 'linear-gradient(135deg, #ff6d5a, #ea4b71)' } : undefined}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="micro-label">Lead time (h)</label>
                <input type="number" min="0" max="72" value={publicationLeadTime} onChange={(e) => setPublicationLeadTime(parseInt(e.target.value) || 0)} className="glass-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="micro-label">Buffer (mins)</label>
                <input type="number" min="5" max="240" value={generationBufferMins} onChange={(e) => setGenerationBufferMins(parseInt(e.target.value) || 0)} className="glass-input w-full" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={onActivate} disabled={isCreating || !canActivate} className="btn-primary px-8">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isCreating ? 'Initializing…' : 'Activate Automation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================ PIPELINE RUNNER (loading screen) ============================ */

function PipelineRunner({ progress }: { progress: PipelineProgress }) {
  const stages: { key: Stage; label: string; model?: string; icon: React.ReactNode }[] = [
    { key: 'crawl', label: 'Crawling site', model: 'Sitemap + on-page links', icon: <Globe className="w-4 h-4" /> },
    { key: 'extract', label: 'Extracting insights', model: progress.models?.extract || 'Qwen 2.5-72B', icon: <FileSearch className="w-4 h-4" /> },
    { key: 'write', label: 'Writing article', model: progress.models?.write || 'Llama 3.3-70B', icon: <PenTool className="w-4 h-4" /> },
    { key: 'refine', label: 'SEO refinement', model: progress.models?.refine || 'DeepSeek V3', icon: <Wand2 className="w-4 h-4" /> },
  ];

  const order: Stage[] = ['crawl', 'extract', 'write', 'refine', 'done'];
  const currentIdx = order.indexOf(progress.stage);

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="text-center space-y-2">
        <div className="neural-label">Live pipeline</div>
        <h2 className="text-3xl font-display font-bold text-white">Synthesizing your content</h2>
        <p className="text-[color:var(--color-fg-2)]">Multi-model orchestration in progress.</p>
      </div>

      <div className="surface p-6 space-y-4">
        {stages.map((s, i) => {
          const state = currentIdx > i ? 'done' : currentIdx === i ? 'active' : 'pending';
          return (
            <div key={s.key} className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${state === 'active' ? 'pulse-glow' : ''}`}
                style={{
                  background:
                    state === 'done' ? 'linear-gradient(135deg, #ff6d5a, #ea4b71)' :
                    state === 'active' ? 'linear-gradient(135deg, #ff6d5a33, #ea4b7111)' :
                    'var(--color-bg-2)',
                  border: state === 'pending' ? '1px solid var(--color-line)' : '1px solid rgba(255,109,90,0.4)',
                  color: state === 'done' ? '#fff' : state === 'active' ? '#ff8b6e' : 'var(--color-fg-3)'
                }}
              >
                {state === 'done' ? <Check className="w-4 h-4" /> : state === 'active' ? <Loader2 className="w-4 h-4 animate-spin" /> : s.icon}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${state === 'pending' ? 'text-[color:var(--color-fg-3)]' : 'text-white'}`}>{s.label}</div>
                <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">{s.model}</div>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{
                color: state === 'done' ? '#34d399' : state === 'active' ? '#ff8b6e' : 'var(--color-fg-3)'
              }}>
                {state === 'done' ? 'DONE' : state === 'active' ? 'RUNNING' : 'QUEUED'}
              </div>
            </div>
          );
        })}
      </div>

      {progress.crawl && (
        <div className="surface-2 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="micro-label">Crawl summary</div>
            <span className="chip-brand">{progress.crawl.totalPages} pages · {progress.crawl.totalWords.toLocaleString()} words</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar text-[12px] font-mono">
            {progress.crawl.pages.slice(0, 20).map((p) => (
              <div key={p.url} className="flex items-center justify-between gap-3 py-1 border-b border-[color:var(--color-line)]/60">
                <span className="text-[color:var(--color-fg-1)] truncate flex-1">{p.title || p.url}</span>
                <span className="text-[color:var(--color-fg-3)] shrink-0">{p.words}w</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ RESULTS ============================ */

function ResultsHeader({ activeView, setActiveView, onBack, onCommit, isCommitting, models, meta }: {
  activeView: 'preview' | 'insights' | 'crawl';
  setActiveView: (v: any) => void;
  onBack: () => void; onCommit: () => void; isCommitting: boolean;
  models?: { extract: string; write: string; refine: string };
  meta?: { crawledPages: number; crawledWords: number };
}) {
  return (
    <div className="sticky top-16 z-40 backdrop-blur-xl bg-[color:var(--color-bg-0)]/80 border-b border-[color:var(--color-line)]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="surface-2 p-1 rounded-xl flex gap-1">
            {(['preview', 'insights', 'crawl'] as const).map((v) => (
              <button key={v} onClick={() => setActiveView(v)} className={`px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeView === v ? 'text-white' : 'text-[color:var(--color-fg-2)] hover:text-white'}`}
                style={activeView === v ? { background: 'linear-gradient(135deg, #ff6d5a, #ea4b71)' } : undefined}>
                {v}
              </button>
            ))}
          </div>
          {meta && (
            <span className="chip ml-2">{meta.crawledPages} pages · {meta.crawledWords.toLocaleString()} words</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {models && (
            <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-[color:var(--color-fg-2)]">
              <Activity className="w-3 h-3 text-[#ff8b6e]" />
              Qwen → Llama → DeepSeek
            </div>
          )}
          <button onClick={onBack} className="btn-secondary py-2 px-4 text-xs">Edit Parameters</button>
          <button onClick={onCommit} disabled={isCommitting} className="btn-primary py-2 px-5 text-xs">
            {isCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Save to Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ArticlePreview({ result, onResultChange, imageModel, videoModel }: { result: GenerationResult; onResultChange: (r: GenerationResult) => void; imageModel: string; videoModel: string }) {
  const [generatingFeatured, setGeneratingFeatured] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const handleUpdatePost = (field: keyof typeof result.post, value: any) => {
    onResultChange({ ...result, post: { ...result.post, [field]: value } });
  };
  const handleUpdateSection = (idx: number, field: keyof typeof result.sections[0], value: string) => {
    const newSections = [...result.sections];
    newSections[idx] = { ...newSections[idx], [field]: value };
    onResultChange({ ...result, sections: newSections });
  };

  const generateImage = async (prompt: string): Promise<string | null> => {
    const r = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: imageModel }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${r.status}`);
    }
    const d = await r.json();
    return d.url || null;
  };

  const handleGenerateFeatured = async () => {
    setGeneratingFeatured(true); setMediaError(null);
    try {
      const url = await generateImage(result.post.featured_image_prompt || result.post.title);
      if (url) handleUpdatePost('featured_image_url', url);
    } catch (e: any) {
      setMediaError(`Featured image: ${e.message}`);
    } finally { setGeneratingFeatured(false); }
  };

  const handleGenerateSectionImage = async (sectionIdx: number) => {
    const section = result.sections[sectionIdx];
    const existing = result.images.find((img: any) => img.section_heading_ref === section.heading);
    const prompt = existing?.prompt || `Editorial illustration for "${section.heading}". Photographic, high detail.`;
    setGeneratingSection(section.heading); setMediaError(null);
    try {
      const url = await generateImage(prompt);
      if (!url) return;
      const images = [...(result.images || [])];
      const idx = images.findIndex((img: any) => img.section_heading_ref === section.heading);
      if (idx === -1) {
        images.push({ section_heading_ref: section.heading, prompt, alt_text: section.heading, image_url: url } as any);
      } else {
        images[idx] = { ...images[idx], image_url: url } as any;
      }
      onResultChange({ ...result, images });
    } catch (e: any) {
      setMediaError(`Section image: ${e.message}`);
    } finally { setGeneratingSection(null); }
  };

  const handleGenerateAllImages = async () => {
    setGeneratingAll(true); setMediaError(null);
    try {
      // featured
      if (!result.post.featured_image_url) {
        try {
          const u = await generateImage(result.post.featured_image_prompt || result.post.title);
          if (u) handleUpdatePost('featured_image_url', u);
        } catch (e: any) { setMediaError(`Featured: ${e.message}`); }
      }
      // each section (sequential to be polite on HF)
      const images = [...(result.images || [])];
      for (const section of result.sections) {
        const existingIdx = images.findIndex((img: any) => img.section_heading_ref === section.heading);
        const existing = existingIdx !== -1 ? images[existingIdx] : null;
        if ((existing as any)?.image_url) continue;
        const prompt = existing?.prompt || `Editorial illustration for "${section.heading}". Photographic, high detail.`;
        setGeneratingSection(section.heading);
        try {
          const u = await generateImage(prompt);
          if (u) {
            if (existingIdx === -1) images.push({ section_heading_ref: section.heading, prompt, alt_text: section.heading, image_url: u } as any);
            else images[existingIdx] = { ...images[existingIdx], image_url: u } as any;
          }
        } catch (e: any) {
          setMediaError((prev) => prev || `Section "${section.heading}": ${e.message}`);
        }
      }
      onResultChange({ ...result, images });
    } finally {
      setGeneratingSection(null); setGeneratingAll(false);
    }
  };

  const handleGenerateHeroVideo = async () => {
    setGeneratingVideo(true); setMediaError(null);
    try {
      const r = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: result.post.featured_image_prompt || result.post.title, model: videoModel, numFrames: 65, fps: 24 }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      if (d.url) setVideoUrl(d.url);
    } catch (e: any) {
      setMediaError(`Video: ${e.message}`);
    } finally { setGeneratingVideo(false); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-8">
      <aside className="lg:col-span-3 lg:sticky lg:top-32 self-start space-y-6 hidden lg:block">
        <div className="surface p-5 space-y-3">
          <div className="micro-label">Table of contents</div>
          <nav className="space-y-1.5">
            {result.sections.map((s, i) => {
              const id = s.heading.toLowerCase().replace(/\s+/g, '-');
              return (
                <a key={i} href={`#${id}`} className="block text-xs text-[color:var(--color-fg-2)] hover:text-[#ff8b6e] transition-colors border-l border-[color:var(--color-line)] hover:border-[#ff6d5a] pl-3 py-1">
                  {s.heading}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="surface p-5 space-y-2">
          <div className="micro-label">Categories</div>
          <div className="flex flex-wrap gap-1.5">
            {(result.categories || []).map((c, i) => (
              <span key={i} className="chip-brand">{c.name}</span>
            ))}
          </div>
          <div className="pt-3 border-t border-[color:var(--color-line)] micro-label">Keywords</div>
          <div className="flex flex-wrap gap-1.5">
            {(result.keywords || []).slice(0, 14).map((k, i) => (
              <span key={i} className="chip">{k.keyword}</span>
            ))}
          </div>
        </div>

        <div className="surface p-5 space-y-3">
          <div className="micro-label">Visual Synthesis</div>
          <p className="text-[11px] text-[color:var(--color-fg-2)]">Generate images & video from each section's prompt using your selected media models.</p>
          <button onClick={handleGenerateAllImages} disabled={generatingAll} className="btn-primary py-2 px-3 text-xs w-full">
            {generatingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
            {generatingAll ? 'Generating images…' : 'Generate all images'}
          </button>
          <button onClick={handleGenerateHeroVideo} disabled={generatingVideo} className="btn-secondary py-2 px-3 text-xs w-full">
            {generatingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            {generatingVideo ? 'Synthesizing video…' : 'Generate hero video'}
          </button>
          <div className="text-[10px] font-mono text-[color:var(--color-fg-3)] leading-relaxed">
            Image: {imageModel.split('/').pop()}<br/>Video: {videoModel.split('/').pop()}
          </div>
          {mediaError && (
            <div className="text-[11px] text-red-300 surface-2 border border-red-500/30 bg-red-500/5 p-2 rounded-lg">{mediaError}</div>
          )}
        </div>
      </aside>

      <article className="lg:col-span-9 surface rounded-3xl overflow-hidden">
        <header className="p-8 md:p-12 border-b border-[color:var(--color-line)]">
          <div className="flex flex-wrap gap-2 mb-6">
            {(result.categories || []).map((cat, i) => (
              <span key={i} className="chip-brand">{cat.name}</span>
            ))}
          </div>
          <textarea
            rows={2}
            value={result.post.title || ''}
            onChange={(e) => handleUpdatePost('title', e.target.value)}
            className="w-full bg-transparent text-4xl md:text-5xl font-display font-bold tracking-tight leading-[1.1] text-white focus:outline-none resize-none"
            placeholder="Article Title"
          />
          <div className="flex items-center gap-4 text-[color:var(--color-fg-2)] text-sm mt-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <input
                type="text"
                value={result.post?.reading_time || '0'}
                onChange={(e) => handleUpdatePost('reading_time', e.target.value)}
                className="w-8 font-semibold bg-transparent border-b border-transparent focus:border-[color:var(--color-line)] focus:outline-none text-white"
              />
              <span>min read</span>
            </div>
            <span className="w-1 h-1 rounded-full bg-[color:var(--color-line-2)]" />
            <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="mt-6 p-4 surface-2 rounded-xl space-y-2">
            <label className="micro-label block">Meta Description</label>
            <textarea
              value={result.post?.meta_description || ''}
              onChange={(e) => handleUpdatePost('meta_description', e.target.value)}
              rows={2}
              className="w-full bg-transparent text-sm text-white font-mono focus:outline-none resize-none"
            />
          </div>
        </header>

        {/* Featured media */}
        <div className="relative aspect-[21/9] bg-[color:var(--color-bg-2)] flex items-center justify-center overflow-hidden border-b border-[color:var(--color-line)]">
          {videoUrl ? (
            <video src={videoUrl} controls autoPlay loop muted className="w-full h-full object-cover" />
          ) : result.post.featured_image_url ? (
            <img src={result.post.featured_image_url} alt="Featured" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center space-y-3">
              <ImageIcon className="w-12 h-12 text-[color:var(--color-fg-3)] mx-auto" />
              <button onClick={handleGenerateFeatured} disabled={generatingFeatured} className="btn-primary py-2 px-4 text-xs">
                {generatingFeatured ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {generatingFeatured ? 'Generating…' : 'Generate featured image'}
              </button>
            </div>
          )}
          {(result.post.featured_image_url || videoUrl) && (
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={handleGenerateFeatured} disabled={generatingFeatured} className="surface-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest text-white hover:bg-[color:var(--color-bg-3)]">
                {generatingFeatured ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Wand2 className="w-3 h-3 inline mr-1" />}
                Regenerate image
              </button>
            </div>
          )}
        </div>
        <div className="px-8 md:px-12 pt-4 surface-2 mx-8 md:mx-12 mt-4 rounded-xl">
          <details>
            <summary className="text-[10px] font-mono uppercase tracking-widest text-[color:var(--color-fg-2)] cursor-pointer py-2">Featured image prompt</summary>
            <textarea
              value={result.post?.featured_image_prompt || ''}
              onChange={(e) => handleUpdatePost('featured_image_prompt', e.target.value)}
              rows={2}
              className="w-full bg-transparent text-[12px] font-mono text-white focus:outline-none resize-none mt-1 pb-3"
            />
          </details>
        </div>

        <div className="p-8 md:p-12 space-y-12 markdown-body">
          {result.sections.map((section, idx) => {
            const id = section.heading.toLowerCase().replace(/\s+/g, '-');
            const sectionImage = (result.images || []).find((img: any) => img.section_heading_ref === section.heading) as any;
            return (
              <section key={idx} id={id} className="scroll-mt-32 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <input
                    type="text"
                    value={section.heading}
                    onChange={(e) => handleUpdateSection(idx, 'heading', e.target.value)}
                    className="flex-1 text-2xl md:text-3xl font-display font-bold tracking-tight text-white bg-transparent focus:outline-none"
                  />
                  <button
                    onClick={() => handleGenerateSectionImage(idx)}
                    disabled={generatingSection === section.heading}
                    className="btn-secondary py-1.5 px-3 text-[10px] uppercase tracking-widest shrink-0 mt-2"
                    title="Generate image for this section"
                  >
                    {generatingSection === section.heading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    {sectionImage?.image_url ? 'Regenerate' : 'Image'}
                  </button>
                </div>
                {sectionImage?.image_url && (
                  <div className="rounded-2xl overflow-hidden border border-[color:var(--color-line)]">
                    <img src={sectionImage.image_url} alt={sectionImage.alt_text} className="w-full aspect-[16/9] object-cover" />
                  </div>
                )}
                <div
                  className="prose-content leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: section.content_html || '' }}
                />
                <details className="surface-2 rounded-xl px-4 py-3">
                  <summary className="text-[10px] font-mono uppercase tracking-widest text-[color:var(--color-fg-2)] cursor-pointer">Edit HTML source</summary>
                  <textarea
                    value={section.content_html}
                    onChange={(e) => handleUpdateSection(idx, 'content_html', e.target.value)}
                    rows={10}
                    className="mt-3 w-full bg-transparent text-[12px] font-mono text-[color:var(--color-fg-1)] focus:outline-none resize-y"
                  />
                </details>
              </section>
            );
          })}

          {result.products && result.products.length > 0 && (
            <section className="pt-8 border-t border-[color:var(--color-line)]">
              <div className="neural-label mb-4">Featured Resources</div>
              <div className="grid md:grid-cols-2 gap-4">
                {result.products.map((p, i) => (
                  <div key={i} className="surface-2 p-5 rounded-2xl">
                    <div className="text-[10px] font-mono text-[#ff8b6e] uppercase tracking-widest mb-2">{p.price || '—'}</div>
                    <div className="text-lg font-semibold text-white mb-2">{p.name}</div>
                    <p className="text-sm text-[color:var(--color-fg-2)]">{p.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.internal_links && result.internal_links.length > 0 && (
            <section className="pt-8 border-t border-[color:var(--color-line)]">
              <div className="neural-label mb-4">Related</div>
              <div className="grid gap-2">
                {result.internal_links.map((link, i) => (
                  <a key={i} href={`/${link.target_slug}`} className="flex items-center justify-between surface-2 p-4 rounded-xl hover:border-[#ff6d5a]/40 transition-colors group">
                    <div className="flex items-center gap-3">
                      <LinkIcon className="w-4 h-4 text-[#ff8b6e]" />
                      <span className="text-sm text-white font-medium">{link.anchor_text}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[color:var(--color-fg-3)] group-hover:text-[#ff8b6e] group-hover:translate-x-1 transition-all" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}

function InsightsView({ insights }: { insights: any }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="surface p-6 lg:col-span-2">
        <div className="neural-label mb-2">Executive Summary</div>
        <p className="text-[color:var(--color-fg-0)] leading-relaxed">{insights.summary}</p>
      </div>
      <InsightList title="Topics" items={insights.topics || []} />
      <InsightList title="Target Keywords" items={insights.targetKeywords || []} accent />
      <InsightList title="Long-tail Keywords" items={insights.longTailKeywords || []} />
      <InsightList title="Key Facts" items={insights.keyFacts || []} />
      <InsightList title="Audience Signals" items={insights.audienceSignals || []} />
      <InsightList title="Content Gaps" items={insights.contentGaps || []} accent />
      <div className="surface p-6">
        <div className="neural-label mb-2">Entities</div>
        <div className="flex flex-wrap gap-2">
          {(insights.entities || []).map((e: any, i: number) => (
            <span key={i} className="chip"><span className="text-[#ff8b6e] mr-1">{e.type}:</span>{e.name}</span>
          ))}
        </div>
      </div>
      <div className="surface p-6">
        <div className="neural-label mb-2">Competitive Positioning</div>
        <p className="text-sm text-[color:var(--color-fg-1)] leading-relaxed">{insights.competitivePositioning}</p>
        <div className="neural-label mt-4 mb-2">Brand Voice</div>
        <p className="text-sm text-[color:var(--color-fg-1)] leading-relaxed">{insights.brandVoice}</p>
      </div>
    </div>
  );
}

function InsightList({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className="surface p-6">
      <div className="neural-label mb-3">{title}</div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[color:var(--color-fg-1)]">
            <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${accent ? 'bg-[#ff6d5a]' : 'bg-[color:var(--color-fg-3)]'}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrawlReport({ crawl }: { crawl: { totalPages: number; totalWords: number; pages: CrawledPageMeta[] } }) {
  return (
    <div className="surface p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="neural-label">Crawl Report</div>
          <h3 className="text-2xl font-display font-bold text-white mt-1">{crawl.totalPages} pages ingested</h3>
        </div>
        <span className="chip-brand">{crawl.totalWords.toLocaleString()} words</span>
      </div>
      <div className="surface-2 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-3)] text-[color:var(--color-fg-2)] uppercase tracking-widest text-[10px]">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">URL</th>
              <th className="text-right px-4 py-3">Words</th>
            </tr>
          </thead>
          <tbody>
            {crawl.pages.map((p) => (
              <tr key={p.url} className="border-t border-[color:var(--color-line)]">
                <td className="px-4 py-3 text-white">{p.title || '(no title)'}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-[color:var(--color-fg-2)] truncate max-w-md">{p.url}</td>
                <td className="px-4 py-3 text-right font-mono text-[color:var(--color-fg-1)]">{p.words}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ AUTOMATION HUB ============================ */

function AutomationHub({ tasks, teams, onRun, onDelete, onNew, onTasksRefresh, onManageTeams }: {
  tasks: any[]; teams: any[]; onRun: (id: number) => void; onDelete: (id: number) => void;
  onNew: () => void; onTasksRefresh: () => void; onManageTeams: () => void;
}) {
  const active = tasks.filter(t => t.status === 'ACTIVE').length;
  const weekly = tasks.reduce((acc, t) => acc + (t.posts_per_day || 2), 0) * 7;
  const [assigningTaskId, setAssigningTaskId] = useState<number | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const handleAssignTeam = async (taskId: number, teamId: number | null) => {
    setAssignLoading(true);
    try {
      await fetch(`/api/automation-tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      });
      onTasksRefresh();
    } finally {
      setAssignLoading(false);
      setAssigningTaskId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <div className="neural-label">Automation</div>
          <h2 className="text-3xl font-display font-bold text-white mt-1">Recurring pipelines</h2>
          <p className="text-[color:var(--color-fg-2)] mt-1">Monitor and manage scheduled content generation runs.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onManageTeams} className="btn-secondary px-5 py-2 text-xs"><Users className="w-3.5 h-3.5" /> Manage Teams</button>
          <button onClick={onNew} className="btn-primary px-6"><Plus className="w-4 h-4" /> New Pipeline</button>
        </div>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard label="Active pipelines" value={active.toString()} />
        <StatCard label="Weekly output" value={`${weekly} posts`} accent />
        <StatCard label="Teams available" value={teams.length.toString()} />
        <StatCard label="Engine status" value="Healthy" />
      </div>
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-2)] text-[color:var(--color-fg-2)] uppercase tracking-widest text-[10px]">
            <tr>
              <th className="text-left px-6 py-4">Pipeline</th>
              <th className="text-left px-6 py-4">Audience</th>
              <th className="text-left px-6 py-4">Team</th>
              <th className="text-left px-6 py-4">Cadence</th>
              <th className="text-left px-6 py-4">Next run</th>
              <th className="text-left px-6 py-4">Status</th>
              <th className="text-right px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-[color:var(--color-fg-2)] font-mono text-xs">NO_PIPELINES_CONFIGURED</td></tr>
            )}
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-[color:var(--color-line)]">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,109,90,0.12)', border: '1px solid rgba(255,109,90,0.3)' }}>
                      <Database className="w-4 h-4 text-[#ff8b6e]" />
                    </div>
                    <div>
                      <div className="text-white font-semibold">{task.niche}</div>
                      <div className="text-[10px] font-mono text-[color:var(--color-fg-2)] uppercase tracking-widest">{task.category}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-[color:var(--color-fg-1)]">{task.audience}</td>
                <td className="px-6 py-4">
                  {assigningTaskId === task.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        autoFocus
                        defaultValue={task.team_id || ''}
                        onChange={(e) => handleAssignTeam(task.id, e.target.value ? parseInt(e.target.value) : null)}
                        disabled={assignLoading}
                        className="glass-input text-xs py-1 px-2 min-w-[140px]"
                      >
                        <option value="">No Team</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button onClick={() => setAssigningTaskId(null)} className="p-1 text-[color:var(--color-fg-2)] hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAssigningTaskId(task.id)}
                      className="flex items-center gap-1.5 group"
                      title="Click to assign team"
                    >
                      {task.team ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                          <Users className="w-3 h-3" />{task.team.name}
                        </span>
                      ) : (
                        <span className="chip text-[10px] opacity-50 group-hover:opacity-100 transition-opacity">
                          <UserPlus className="w-3 h-3 inline mr-1" />Assign
                        </span>
                      )}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4">
                  {task.schedule_type === 'DAILY' ? (
                    <span className="chip"><Clock className="w-3 h-3 inline mr-1" />Daily at {task.schedule_time}</span>
                  ) : (
                    <span className="chip"><Zap className="w-3 h-3 inline mr-1" />Every {task.interval_hours || 12}h</span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-[11px] text-[color:var(--color-fg-2)]">
                  {task.next_run ? new Date(task.next_run).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending…'}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${task.status === 'ACTIVE' ? 'text-emerald-400' : 'text-[color:var(--color-fg-2)]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-[color:var(--color-fg-3)]'}`} />
                    {task.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => onRun(task.id)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-[#ff8b6e] hover:bg-[color:var(--color-bg-2)] transition-colors" title="Run now"><Zap className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(task.id)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface p-6">
      <div className="micro-label mb-2">{label}</div>
      <div className={`text-3xl font-display font-bold ${accent ? 'gradient-text' : 'text-white'}`}>{value}</div>
    </div>
  );
}

/* ============================ ARCHIVE ============================ */

function ArchiveView({ posts, isLoading, onDelete, onView, onRefresh }: {
  posts: any[]; isLoading: boolean; onDelete: (id: number) => void; onView: (post: any) => void; onRefresh: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="neural-label">Archive</div>
          <h2 className="text-3xl font-display font-bold text-white mt-1">Project archive</h2>
          <p className="text-[color:var(--color-fg-2)] mt-1">View and manage your saved content.</p>
        </div>
        <button onClick={onRefresh} className="btn-secondary px-4 py-2 text-xs">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />} Refresh
        </button>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard label="Total" value={posts.length.toString()} />
        <StatCard label="Sections" value={posts.reduce((acc, p) => acc + (p.sections?.length || 0), 0).toString()} accent />
        <StatCard label="Avg. reading" value="6.2 min" />
        <StatCard label="Status" value="Stable" />
      </div>
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-2)] text-[color:var(--color-fg-2)] uppercase tracking-widest text-[10px]">
            <tr>
              <th className="text-left px-6 py-4">Title</th>
              <th className="text-left px-6 py-4">Created</th>
              <th className="text-left px-6 py-4">Status</th>
              <th className="text-right px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="px-6 py-16 text-center text-[color:var(--color-fg-2)] font-mono text-xs">NO_PROJECTS_FOUND_IN_ARCHIVE</td></tr>
            )}
            {posts.map((post) => (
              <tr key={post.id} className="border-t border-[color:var(--color-line)] hover:bg-[color:var(--color-bg-2)]/40 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-white font-semibold">{post.title}</div>
                  <div className="text-[10px] font-mono text-[color:var(--color-fg-2)] uppercase tracking-widest">/{post.slug}</div>
                </td>
                <td className="px-6 py-4 text-[color:var(--color-fg-2)] font-mono text-[11px]">
                  {new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-6 py-4">
                  <span className={`chip ${post.status === 'published' ? '!text-emerald-400 !border-emerald-400/30' : ''}`}>{post.status || 'draft'}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => onView(post)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-[#ff8b6e] hover:bg-[color:var(--color-bg-2)] transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(post.id)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ TEAMS ============================ */

const TEAM_ROLE_META: Record<string, { label: string; color: string; bg: string; short: string }> = {
  extract:   { label: 'Data Extractor',  color: '#818cf8', bg: 'rgba(99,102,241,0.12)',  short: 'EXT' },
  write:     { label: 'Content Writer',  color: '#34d399', bg: 'rgba(16,185,129,0.12)',  short: 'WRT' },
  refine:    { label: 'SEO Refiner',     color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  short: 'SEO' },
  image:     { label: 'Image Gen',       color: '#f472b6', bg: 'rgba(236,72,153,0.12)',  short: 'IMG' },
  video:     { label: 'Video Gen',       color: '#c084fc', bg: 'rgba(139,92,246,0.12)',  short: 'VID' },
  faq:       { label: 'FAQ Specialist',  color: '#22d3ee', bg: 'rgba(6,182,212,0.12)',   short: 'FAQ' },
  social:    { label: 'Social Media',    color: '#fb923c', bg: 'rgba(249,115,22,0.12)',  short: 'SOC' },
  translate: { label: 'Translator',      color: '#2dd4bf', bg: 'rgba(20,184,166,0.12)',  short: 'TRL' },
  summarize: { label: 'Summarizer',      color: '#a3e635', bg: 'rgba(132,204,22,0.12)',  short: 'SUM' },
  tts:       { label: 'TTS Narrator',    color: '#e879f9', bg: 'rgba(168,85,247,0.12)',  short: 'TTS' },
  // Parallel workers for canvas team nodes (worker_1..worker_4)
  worker_1:  { label: 'Worker 1',        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  short: 'W1' },
  worker_2:  { label: 'Worker 2',        color: '#34d399', bg: 'rgba(52,211,153,0.12)',  short: 'W2' },
  worker_3:  { label: 'Worker 3',        color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  short: 'W3' },
  worker_4:  { label: 'Worker 4',        color: '#f472b6', bg: 'rgba(244,114,182,0.12)', short: 'W4' },
};

const WORKER_MODEL_OPTIONS = [
  { id: 'Qwen/Qwen2.5-72B-Instruct',              label: 'Qwen 2.5 · 72B' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct',      label: 'Llama 3.3 · 70B' },
  { id: 'deepseek-ai/DeepSeek-V3',                label: 'DeepSeek V3' },
  { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',  label: 'Mixtral 8x22B' },
  { id: 'Qwen/Qwen2.5-32B-Instruct',              label: 'Qwen 2.5 · 32B' },
  { id: 'mistralai/Mistral-Large-Instruct-2411',   label: 'Mistral Large' },
  { id: 'google/gemma-2-27b-it',                  label: 'Gemma 2 · 27B' },
];

const TASK_TYPE_OPTIONS = [
  { id: 'GENERAL',           label: 'General',                   suggested: ['extract','write','refine','image','video','faq','social'] },
  { id: 'CONTENT_WRITING',   label: 'Content Writing',           suggested: ['write','refine','faq','social','summarize'] },
  { id: 'DATA_EXTRACTION',   label: 'Data Extraction',           suggested: ['extract','summarize'] },
  { id: 'SEO',               label: 'SEO Pipeline',              suggested: ['extract','write','refine','faq'] },
  { id: 'MEDIA',             label: 'Media Production',          suggested: ['image','video','tts'] },
  { id: 'IMAGE_GENERATION',  label: 'Image Generation Team',     suggested: ['worker_1','worker_2','worker_3'] },
  { id: 'VIDEO_GENERATION',  label: 'Video Generation Team',     suggested: ['worker_1','worker_2'] },
  { id: 'WORKFLOW',          label: 'Canvas Workflow (Workers)', suggested: ['worker_1','worker_2','worker_3'] },
];

const MODEL_OPTIONS_BY_ROLE: Record<string, Array<{ id: string; label: string }>> = {
  extract:   [{ id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }, { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }, { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B' }, { id: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen 2.5 · 32B' }],
  write:     [{ id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }, { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }, { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'mistralai/Mistral-Large-Instruct-2411', label: 'Mistral Large 2411' }, { id: 'google/gemma-2-27b-it', label: 'Gemma 2 · 27B' }],
  refine:    [{ id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }, { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }],
  image:     [{ id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell' }, { id: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1 Dev' }, { id: 'stabilityai/stable-diffusion-3.5-large', label: 'SD 3.5 Large' }, { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base' }],
  video:     [{ id: 'Wan-AI/Wan2.1-T2V-14B', label: 'Wan 2.1 T2V' }, { id: 'Wan-AI/Wan2.2-T2V-A14B', label: 'Wan 2.2 T2V' }, { id: 'tencent/HunyuanVideo', label: 'Hunyuan Video' }, { id: 'Lightricks/LTX-Video', label: 'LTX-Video' }],
  faq:       [{ id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }, { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }],
  social:    [{ id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }, { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }],
  translate: [{ id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'mistralai/Mistral-Large-Instruct-2411', label: 'Mistral Large' }, { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }],
  summarize: [{ id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' }, { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 · 72B' }, { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 · 70B' }],
  tts:       [{ id: 'facebook/mms-tts-eng', label: 'MMS TTS English' }, { id: 'suno/bark', label: 'Bark' }, { id: 'coqui/XTTS-v2', label: 'Coqui XTTS-v2' }],
  worker_1:  WORKER_MODEL_OPTIONS,
  worker_2:  WORKER_MODEL_OPTIONS,
  worker_3:  WORKER_MODEL_OPTIONS,
  worker_4:  WORKER_MODEL_OPTIONS,
};

function TeamsView({ teams, tasks, onRefresh }: { teams: any[]; tasks: any[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const totalMembers = teams.reduce((acc, t) => acc + (t.members?.length || 0), 0);
  const tasksWithTeams = tasks.filter(t => t.team_id).length;

  const handleEdit = (team: any) => { setEditingTeam(team); setShowForm(true); };
  const handleCreate = () => { setEditingTeam(null); setShowForm(true); };
  const handleClose = () => { setShowForm(false); setEditingTeam(null); };
  const handleSaved = () => { handleClose(); onRefresh(); };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this team? Tasks using it will be unassigned.')) return;
    await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <div className="neural-label">Team Management</div>
          <h2 className="text-3xl font-display font-bold text-white mt-1">AI Agent Teams</h2>
          <p className="text-[color:var(--color-fg-2)] mt-1">Build teams of AI models for each pipeline role. Assign them to automation tasks.</p>
        </div>
        <button onClick={handleCreate} className="btn-primary px-6"><Plus className="w-4 h-4" /> New Team</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard label="Teams configured" value={teams.length.toString()} />
        <StatCard label="AI agents deployed" value={totalMembers.toString()} accent />
        <StatCard label="Tasks using teams" value={tasksWithTeams.toString()} />
      </div>

      {teams.length === 0 ? (
        <div className="surface p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Users className="w-7 h-7 text-[#818cf8]" />
          </div>
          <div>
            <p className="text-white font-semibold">No teams yet</p>
            <p className="text-[color:var(--color-fg-2)] text-sm mt-1">Create your first team to assign AI models to each pipeline role.</p>
          </div>
          <button onClick={handleCreate} className="btn-primary px-8 mx-auto">Create first team</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {teams.map(team => {
            const taskCount = tasks.filter(t => t.team_id === team.id).length;
            const isExpanded = expandedTeam === team.id;
            const typeOpt = TASK_TYPE_OPTIONS.find(o => o.id === team.task_type);
            return (
              <div key={team.id} className="surface p-0 overflow-hidden flex flex-col">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
                        <Bot className="w-5 h-5 text-[#818cf8]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{team.name}</div>
                        {team.description && <div className="text-[11px] text-[color:var(--color-fg-2)] mt-0.5 truncate">{team.description}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(team)} className="p-1.5 rounded-lg text-[color:var(--color-fg-2)] hover:text-white hover:bg-[color:var(--color-bg-2)] transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(team.id)} className="p-1.5 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                      {typeOpt?.label || team.task_type}
                    </span>
                    {taskCount > 0 && (
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                        {taskCount} task{taskCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-[color:var(--color-fg-2)] ml-auto">{team.members?.length || 0} agents</span>
                  </div>
                </div>

                <div className="border-t border-[color:var(--color-line)] px-5 py-3 space-y-1.5">
                  {(isExpanded ? team.members : team.members?.slice(0, 3))?.map((m: any) => {
                    const rm = TEAM_ROLE_META[m.role] || { label: m.role, color: '#888', bg: 'rgba(128,128,128,0.1)', short: m.role.toUpperCase().slice(0, 3) };
                    const modelShort = m.model_label?.split('·')[0]?.trim() || m.model_id?.split('/').pop() || m.model_id;
                    return (
                      <div key={m.id} className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold w-8 text-center rounded px-1 py-0.5 flex-shrink-0" style={{ background: rm.bg, color: rm.color }}>{rm.short}</span>
                        <span className="text-[11px] text-[color:var(--color-fg-2)] flex-1 truncate">{rm.label}</span>
                        <span className="text-[10px] font-mono text-white/70 truncate max-w-[110px]">{modelShort}</span>
                        {!m.is_active && <span className="text-[9px] font-mono text-amber-400/60">off</span>}
                      </div>
                    );
                  })}
                  {(team.members?.length || 0) > 3 && (
                    <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="text-[10px] font-mono text-[#818cf8] hover:text-white transition-colors mt-1">
                      {isExpanded ? '▲ Show less' : `▼ +${team.members.length - 3} more agents`}
                    </button>
                  )}
                  {(team.members?.length || 0) === 0 && (
                    <div className="text-[11px] text-[color:var(--color-fg-2)] italic">No agents — click Edit to add roles</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <TeamFormModal
            team={editingTeam}
            onClose={handleClose}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamFormModal({ team, onClose, onSaved }: { team: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!team;
  const [name, setName] = useState(team?.name || '');
  const [desc, setDesc] = useState(team?.description || '');
  const [taskType, setTaskType] = useState(team?.task_type || 'GENERAL');
  const [members, setMembers] = useState<Array<{ id?: number; role: string; model_id: string; model_label: string; instructions: string; hf_token: string; groq_key: string; is_active: boolean }>>(
    (team?.members || []).map((m: any) => ({ id: m.id, role: m.role, model_id: m.model_id, model_label: m.model_label, instructions: m.instructions || '', hf_token: m.hf_token || '', groq_key: m.groq_key || '', is_active: m.is_active }))
  );
  const [saving, setSaving] = useState(false);
  const [addingRole, setAddingRole] = useState('');
  const [error, setError] = useState<string | null>(null);

  const suggestedRoles = TASK_TYPE_OPTIONS.find(o => o.id === taskType)?.suggested || [];
  const usedRoles = new Set(members.map(m => m.role));
  const availableRoles = Object.keys(TEAM_ROLE_META).filter(r => !usedRoles.has(r));

  const handleAddRole = (role: string) => {
    if (!role || usedRoles.has(role)) return;
    const opts = MODEL_OPTIONS_BY_ROLE[role] || [];
    setMembers(prev => [...prev, { role, model_id: opts[0]?.id || '', model_label: opts[0]?.label || '', instructions: '', hf_token: '', groq_key: '', is_active: true }]);
    setAddingRole('');
  };

  const handleAddSuggested = () => {
    const toAdd = suggestedRoles.filter(r => !usedRoles.has(r));
    const newMembers = toAdd.map((role) => {
      const opts = MODEL_OPTIONS_BY_ROLE[role] || [];
      return { role, model_id: opts[0]?.id || '', model_label: opts[0]?.label || '', instructions: '', hf_token: '', groq_key: '', is_active: true };
    });
    setMembers(prev => [...prev, ...newMembers]);
  };

  const handleRemoveMember = (role: string) => setMembers(prev => prev.filter(m => m.role !== role));

  const handleMemberChange = (role: string, field: string, value: any) => {
    setMembers(prev => prev.map(m => {
      if (m.role !== role) return m;
      if (field === 'model_id') {
        const opts = MODEL_OPTIONS_BY_ROLE[role] || [];
        const opt = opts.find(o => o.id === value);
        return { ...m, model_id: value, model_label: opt?.label || value };
      }
      return { ...m, [field]: value };
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await fetch(`/api/teams/${team.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, task_type: taskType }),
        });
        // Sync members: upsert each
        for (const m of members) {
          await fetch(`/api/teams/${team.id}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: m.role, model_id: m.model_id, model_label: m.model_label, instructions: m.instructions || null, hf_token: m.hf_token || null, groq_key: m.groq_key || null, is_active: m.is_active }),
          });
        }
        // Remove members that were deleted
        const currentRoles = new Set(members.map(m => m.role));
        for (const om of (team.members || [])) {
          if (!currentRoles.has(om.role)) {
            await fetch(`/api/teams/${team.id}/members/${om.id}`, { method: 'DELETE' });
          }
        }
      } else {
        await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, task_type: taskType, members: members.map((m, i) => ({ ...m, priority: i, hf_token: m.hf_token || null, groq_key: m.groq_key || null })) }),
        });
      }
      onSaved();
    } catch (e) {
      setError('Failed to save team. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-2xl h-full overflow-y-auto surface-2 border-l border-[color:var(--color-line)]"
        style={{ background: 'var(--color-bg-1)' }}
      >
        <div className="sticky top-0 z-10 px-8 py-5 border-b border-[color:var(--color-line)] flex items-center justify-between" style={{ background: 'var(--color-bg-1)' }}>
          <div>
            <div className="neural-label">{isEdit ? 'Edit Team' : 'New Team'}</div>
            <h3 className="text-xl font-display font-bold text-white mt-0.5">{isEdit ? team.name : 'Configure AI agent team'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-white hover:bg-[color:var(--color-bg-2)] transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-8 space-y-8">
          {/* Basic info */}
          <div className="space-y-4">
            <div className="neural-label">Team Identity</div>
            <div className="space-y-3">
              <div>
                <label className="micro-label mb-1.5">Team Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium Content Team" className="glass-input w-full" />
              </div>
              <div>
                <label className="micro-label mb-1.5">Description</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this team specialise in?" className="glass-input w-full" />
              </div>
              <div>
                <label className="micro-label mb-1.5">Team Type</label>
                <select value={taskType} onChange={e => setTaskType(e.target.value)} className="glass-input w-full">
                  {TASK_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="neural-label">AI Agents · Roles</div>
              <div className="flex gap-2">
                {suggestedRoles.some(r => !usedRoles.has(r)) && (
                  <button onClick={handleAddSuggested} className="btn-secondary py-1.5 px-3 text-xs">
                    <Sparkles className="w-3 h-3" /> Auto-fill suggested
                  </button>
                )}
              </div>
            </div>

            {members.length === 0 && (
              <div className="surface p-6 text-center text-[color:var(--color-fg-2)] text-sm rounded-xl border border-dashed border-[color:var(--color-line)]">
                No agents yet. Use Auto-fill or add roles below.
              </div>
            )}

            <div className="space-y-2">
              {members.map((m) => {
                const rm = TEAM_ROLE_META[m.role] || { label: m.role, color: '#888', bg: 'rgba(128,128,128,0.1)', short: '???' };
                const opts = MODEL_OPTIONS_BY_ROLE[m.role] || [];
                return (
                  <div key={m.role} className="surface rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-md flex-shrink-0" style={{ background: rm.bg, color: rm.color }}>{rm.short}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-semibold">{rm.label}</div>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer" title="Active">
                        <span className="text-[10px] font-mono text-[color:var(--color-fg-2)]">Active</span>
                        <div
                          onClick={() => handleMemberChange(m.role, 'is_active', !m.is_active)}
                          className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${m.is_active ? 'bg-emerald-500' : 'bg-[color:var(--color-bg-2)]'}`}
                          style={{ position: 'relative' }}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${m.is_active ? 'left-4' : 'left-0.5'}`} />
                        </div>
                      </label>
                      <button onClick={() => handleRemoveMember(m.role)} className="p-1.5 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="micro-label mb-1">Model</label>
                        <select
                          value={m.model_id}
                          onChange={e => handleMemberChange(m.role, 'model_id', e.target.value)}
                          className="glass-input w-full text-xs"
                        >
                          {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          <option value={m.model_id}>{m.model_id.split('/').pop()}</option>
                        </select>
                      </div>
                      <div>
                        <label className="micro-label mb-1">Custom instructions (optional)</label>
                        <input
                          value={m.instructions}
                          onChange={e => handleMemberChange(m.role, 'instructions', e.target.value)}
                          placeholder={`Special instructions for the ${rm.label}…`}
                          className="glass-input w-full text-xs"
                        />
                      </div>
                      {/* Dedicated API keys for this worker */}
                      <details className="group">
                        <summary className="micro-label cursor-pointer flex items-center gap-1.5 select-none list-none">
                          <span className="transition-transform group-open:rotate-90 inline-block text-[color:var(--color-fg-2)]">▶</span>
                          Dedicated API Keys <span className="text-[color:var(--color-fg-3)] font-normal normal-case">(optional — overrides global pool for this worker)</span>
                        </summary>
                        <div className="mt-2 space-y-2 pl-4 border-l-2 border-[color:var(--color-line)]">
                          <div>
                            <label className="micro-label mb-1">
                              <span className="text-[#34d399]">HF Token</span>
                            </label>
                            <input
                              type="password"
                              value={m.hf_token}
                              onChange={e => handleMemberChange(m.role, 'hf_token', e.target.value)}
                              placeholder="hf_…  (leave blank to use shared pool)"
                              className="glass-input w-full text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="micro-label mb-1">
                              <span className="text-[#60a5fa]">Groq Key</span>
                            </label>
                            <input
                              type="password"
                              value={m.groq_key}
                              onChange={e => handleMemberChange(m.role, 'groq_key', e.target.value)}
                              placeholder="gsk_…  (leave blank to use shared pool)"
                              className="glass-input w-full text-xs font-mono"
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>

            {availableRoles.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={addingRole}
                  onChange={e => setAddingRole(e.target.value)}
                  className="glass-input text-xs flex-1"
                >
                  <option value="">+ Select role to add…</option>
                  {availableRoles.map(r => <option key={r} value={r}>{TEAM_ROLE_META[r]?.label || r}</option>)}
                </select>
                <button
                  onClick={() => handleAddRole(addingRole)}
                  disabled={!addingRole}
                  className="btn-secondary py-2 px-4 text-xs disabled:opacity-40"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add Agent
                </button>
              </div>
            )}
          </div>

          {error && <div className="text-red-400 text-sm font-mono">{error}</div>}
        </div>

        <div className="sticky bottom-0 px-8 py-5 border-t border-[color:var(--color-line)] flex gap-3 justify-end" style={{ background: 'var(--color-bg-1)' }}>
          <button onClick={onClose} className="btn-secondary px-6">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary px-8">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create team'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================ SETTINGS ============================ */

interface MaskedToken { id: string; label: string; masked: string; addedAt: string; lastTestedAt?: string; lastStatus?: 'ok' | 'failed' | 'untested'; lastError?: string }

function SettingsView() {
  const [tokens, setTokens] = useState<MaskedToken[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Groq key management
  const [groqKeys, setGroqKeys] = useState<Array<{ id: string; label: string; masked: string }>>([]);
  const [newGroqLabel, setNewGroqLabel] = useState('');
  const [newGroqValue, setNewGroqValue] = useState('');
  const [addingGroq, setAddingGroq] = useState(false);
  const [groqStatus, setGroqStatus] = useState<string | null>(null);

  const runDiagnosticsCheck = async () => {
    setIsRefreshing(true);
    try {
      const resp = await fetch('/api/diagnostics');
      if (resp.ok) setDiagnostics(await resp.json());
    } catch {
      console.error("Diagnostics check failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadTokens = async () => {
    try {
      const r = await fetch('/api/tokens');
      if (r.ok) {
        const d = await r.json();
        setTokens(d.tokens || []);
      }
    } catch (e) { console.error(e); }
  };

  const loadGroqKeys = async () => {
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const d = await r.json();
        const raw: string = d.groq_keys || '';
        if (!raw.trim()) { setGroqKeys([]); return; }
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) { setGroqKeys(arr); return; }
        } catch {}
        setGroqKeys([]);
      }
    } catch (e) { console.error(e); }
  };

  const saveGroqKeys = async (keys: Array<{ id: string; label: string; masked: string; value?: string }>) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_keys: JSON.stringify(keys) }),
    });
  };

  const handleAddGroq = async () => {
    const val = newGroqValue.trim();
    if (!val) { setGroqStatus('KEY_REQUIRED'); return; }
    if (!val.startsWith('gsk_')) { setGroqStatus('INVALID: Groq keys start with gsk_'); return; }
    setAddingGroq(true);
    try {
      const masked = val.slice(0, 8) + '...' + val.slice(-4);
      const newEntry = { id: Date.now().toString(), label: newGroqLabel.trim() || `Groq ${groqKeys.length + 1}`, masked, value: val };
      const updated = [...groqKeys, { id: newEntry.id, label: newEntry.label, masked }];
      // Store full values in a separate key for server use
      const rawArr = await fetch('/api/settings').then(r => r.json()).then(d => {
        try { return JSON.parse(d.groq_keys || '[]'); } catch { return []; }
      });
      const updatedFull = [...rawArr, { id: newEntry.id, label: newEntry.label, masked, value: val }];
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groq_keys: JSON.stringify(updatedFull) }),
      });
      setGroqKeys(updated);
      setNewGroqLabel(''); setNewGroqValue('');
      setGroqStatus('GROQ_KEY_ADDED');
      setTimeout(() => setGroqStatus(null), 3000);
    } catch { setGroqStatus('ADD_FAILED'); }
    finally { setAddingGroq(false); }
  };

  const handleDeleteGroq = async (id: string) => {
    if (!confirm('Remove this Groq key?')) return;
    const rawArr = await fetch('/api/settings').then(r => r.json()).then(d => {
      try { return JSON.parse(d.groq_keys || '[]'); } catch { return []; }
    });
    const updated = rawArr.filter((k: any) => k.id !== id);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_keys: JSON.stringify(updated) }),
    });
    setGroqKeys(prev => prev.filter(k => k.id !== id));
  };

  useEffect(() => {
    loadTokens();
    loadGroqKeys();
    runDiagnosticsCheck();
  }, []);

  const handleAdd = async (test: boolean) => {
    if (!newValue.trim()) { setStatus('TOKEN_VALUE_REQUIRED'); return; }
    setAdding(true);
    try {
      const r = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, value: newValue, test }),
      });
      if (r.ok) {
        const d = await r.json();
        setTokens(d.tokens || []);
        setNewLabel(''); setNewValue('');
        setStatus(test ? 'TOKEN_ADDED_AND_TESTED' : 'TOKEN_ADDED');
        runDiagnosticsCheck();
        setTimeout(() => setStatus(null), 3000);
      } else {
        const e = await r.json().catch(() => ({}));
        setStatus(`ADD_FAILED: ${e.error || r.status}`);
      }
    } catch (e: any) {
      setStatus(`ADD_FAILED: ${e?.message || 'network'}`);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this token from the pool?')) return;
    try {
      const r = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) {
        const d = await r.json();
        setTokens(d.tokens || []);
        runDiagnosticsCheck();
      }
    } catch (e) { console.error(e); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const r = await fetch('/api/tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'test' }),
      });
      if (r.ok) {
        const d = await r.json();
        setTokens(d.tokens || []);
      }
    } catch (e) { console.error(e); }
    finally { setTestingId(null); }
  };

  const handleRename = async (id: string, label: string) => {
    try {
      await fetch('/api/tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label }),
      });
      loadTokens();
    } catch (e) { console.error(e); }
  };

  const hfStatus = diagnostics?.providers?.huggingface?.status;
  const hfWorkers = diagnostics?.providers?.huggingface?.workers ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <div className="neural-label">Settings</div>
          <h2 className="text-3xl font-display font-bold text-white mt-1">Tokens & diagnostics</h2>
          <p className="text-[color:var(--color-fg-2)] mt-1">Add multiple Hugging Face tokens. The pool rotates on rate limits and quota errors.</p>
        </div>
        <button onClick={runDiagnosticsCheck} disabled={isRefreshing} className="btn-secondary py-2 px-4 text-xs">
          {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />} Diagnostics
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="surface p-6 space-y-2">
          <div className="neural-label">HF Router</div>
          <div className={`text-2xl font-display font-bold ${hfStatus === 'ONLINE' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {hfStatus || 'CHECKING…'}
          </div>
          <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">{hfWorkers} active · router.huggingface.co</div>
        </div>
        <div className="surface p-6 space-y-2">
          <div className="neural-label">Tokens in Pool</div>
          <div className="text-2xl font-display font-bold gradient-text">{tokens.length}</div>
          <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">{tokens.filter(t => t.lastStatus === 'ok').length} verified · {tokens.filter(t => t.lastStatus === 'failed').length} failed</div>
        </div>
        <div className="surface p-6 space-y-2">
          <div className="neural-label">Failover</div>
          <div className="text-2xl font-display font-bold text-white">{tokens.length > 1 ? 'Enabled' : 'Single key'}</div>
          <div className="text-[11px] font-mono text-[color:var(--color-fg-2)]">Rotates on 401/403/429/503</div>
        </div>
      </div>

      <div className="surface p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="neural-label">Add Token</div>
            <p className="text-xs text-[color:var(--color-fg-2)] mt-1">Get one at <span className="text-[#ff8b6e]">huggingface.co/settings/tokens</span> — Read scope is enough.</p>
          </div>
          {status && <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${status.startsWith('TOKEN_ADDED') ? 'text-emerald-400' : 'text-red-400'}`}>{status}</span>}
        </div>
        <div className="grid md:grid-cols-[1fr,2fr,auto] gap-3">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (e.g. 'Primary')" className="glass-input" />
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="hf_xxxxxxxxxxxxxxxxxxxxx" className="glass-input font-mono" type="password" />
          <div className="flex gap-2">
            <button onClick={() => handleAdd(false)} disabled={adding || !newValue} className="btn-secondary py-2 px-3 text-xs">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
            </button>
            <button onClick={() => handleAdd(true)} disabled={adding || !newValue} className="btn-primary py-2 px-3 text-xs">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} Add & Test
            </button>
          </div>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--color-line)] flex justify-between items-center">
          <div className="neural-label">Token Pool</div>
          <span className="chip">HF_ROUTER_AUTH</span>
        </div>
        {tokens.length === 0 ? (
          <div className="px-6 py-16 text-center text-[color:var(--color-fg-2)] font-mono text-xs">NO_TOKENS_CONFIGURED · Add one above to get started.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-bg-2)] text-[color:var(--color-fg-2)] uppercase tracking-widest text-[10px]">
              <tr>
                <th className="text-left px-6 py-3">Label</th>
                <th className="text-left px-6 py-3">Token</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Added</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-t border-[color:var(--color-line)]">
                  <td className="px-6 py-3">
                    <input
                      defaultValue={t.label}
                      onBlur={(e) => { if (e.target.value !== t.label) handleRename(t.id, e.target.value); }}
                      className="bg-transparent text-white text-sm font-semibold focus:outline-none focus:border-b focus:border-[color:var(--color-line-2)] w-full"
                    />
                  </td>
                  <td className="px-6 py-3 font-mono text-[11px] text-[color:var(--color-fg-1)]">{t.masked}</td>
                  <td className="px-6 py-3">
                    {t.lastStatus === 'ok' && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Verified
                      </span>
                    )}
                    {t.lastStatus === 'failed' && (
                      <span title={t.lastError} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Failed
                      </span>
                    )}
                    {(!t.lastStatus || t.lastStatus === 'untested') && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-fg-2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-fg-3)]" /> Untested
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-mono text-[11px] text-[color:var(--color-fg-2)]">{new Date(t.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => handleTest(t.id)} disabled={testingId === t.id} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-[#ff8b6e] hover:bg-[color:var(--color-bg-2)] transition-colors" title="Test token">
                        {testingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors" title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Groq Key Pool ── */}
      <div className="surface overflow-hidden" style={{ border: '1px solid rgba(52,211,153,0.2)' }}>
        <div className="px-6 py-5 border-b border-[color:var(--color-line)]" style={{ background: 'rgba(52,211,153,0.05)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-400">FREE · No Credits Needed</span>
              </div>
              <div className="neural-label">Groq API Keys — Recommended</div>
              <p className="text-xs text-[color:var(--color-fg-2)] mt-1">
                Groq runs Llama 3.3 70B for free (rate-limited, no monthly credit cap).
                Get a free key at <span className="text-emerald-400 font-mono">console.groq.com</span> — no credit card required.
                Groq is tried <strong className="text-white">first</strong>; HF tokens are the fallback.
              </p>
            </div>
            {groqStatus && (
              <span className={`text-[10px] font-mono font-bold uppercase tracking-widest flex-shrink-0 ${groqStatus.startsWith('GROQ_KEY') ? 'text-emerald-400' : 'text-red-400'}`}>{groqStatus}</span>
            )}
          </div>
          <div className="grid md:grid-cols-[1fr,2fr,auto] gap-3 mt-4">
            <input value={newGroqLabel} onChange={e => setNewGroqLabel(e.target.value)} placeholder="Label (e.g. 'Free Account 1')" className="glass-input" />
            <input value={newGroqValue} onChange={e => setNewGroqValue(e.target.value)} placeholder="gsk_xxxxxxxxxxxxxxxxxxxx" className="glass-input font-mono" type="password" />
            <button onClick={handleAddGroq} disabled={addingGroq || !newGroqValue} className="btn-primary py-2 px-4 text-xs">
              {addingGroq ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Key
            </button>
          </div>
        </div>
        {groqKeys.length === 0 ? (
          <div className="px-6 py-8 text-center text-[color:var(--color-fg-2)] font-mono text-xs">
            NO_GROQ_KEYS · Add one above to use the free tier. <span className="text-emerald-400">console.groq.com → API Keys → Create</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-bg-2)] text-[color:var(--color-fg-2)] uppercase tracking-widest text-[10px]">
              <tr>
                <th className="text-left px-6 py-3">Label</th>
                <th className="text-left px-6 py-3">Key</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groqKeys.map((k: any) => (
                <tr key={k.id} className="border-t border-[color:var(--color-line)]">
                  <td className="px-6 py-3 text-white font-semibold">{k.label}</td>
                  <td className="px-6 py-3 font-mono text-[11px] text-[color:var(--color-fg-1)]">{k.masked}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Free · Active
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDeleteGroq(k.id)} className="p-2 rounded-lg text-[color:var(--color-fg-2)] hover:text-red-400 hover:bg-[color:var(--color-bg-2)] transition-colors" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="surface p-6 space-y-3">
        <div className="neural-label">Pipeline Models · Defaults</div>
        <p className="text-xs text-[color:var(--color-fg-2)]">These run unless you override them via the Model Picker on the home screen.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-[11px]">
          <div className="surface-2 p-3 rounded-xl"><div className="micro-label mb-1">Extract</div><div className="text-white">Qwen/Qwen2.5-72B-Instruct</div></div>
          <div className="surface-2 p-3 rounded-xl"><div className="micro-label mb-1">Write</div><div className="text-white">meta-llama/Llama-3.3-70B-Instruct</div></div>
          <div className="surface-2 p-3 rounded-xl"><div className="micro-label mb-1">Refine</div><div className="text-white">deepseek-ai/DeepSeek-V3</div></div>
          <div className="surface-2 p-3 rounded-xl"><div className="micro-label mb-1">Image</div><div className="text-white">black-forest-labs/FLUX.1-schnell</div></div>
          <div className="surface-2 p-3 rounded-xl"><div className="micro-label mb-1">Video</div><div className="text-white">Lightricks/LTX-Video</div></div>
        </div>
      </div>
    </div>
  );
}

/* ============================ FOOTER ============================ */

function SiteFooter({ isGenerating, isCommitting }: { isGenerating: boolean; isCommitting: boolean; }) {
  return (
    <footer className="border-t border-[color:var(--color-line)] bg-[color:var(--color-bg-1)]/50 mt-20">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isGenerating || isCommitting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="text-[color:var(--color-fg-2)] uppercase tracking-widest">
              {isGenerating ? 'PIPELINE_RUNNING' : isCommitting ? 'COMMITTING_TO_DB' : 'SYSTEM_NOMINAL'}
            </span>
          </div>
          <span className="text-[color:var(--color-fg-3)]">|</span>
          <span className="text-[color:var(--color-fg-2)] uppercase tracking-widest">v3.0.0-pipeline</span>
        </div>
        <div className="text-[color:var(--color-fg-2)] uppercase tracking-widest">ContentArchitect · Multi-model AI</div>
      </div>
    </footer>
  );
}
