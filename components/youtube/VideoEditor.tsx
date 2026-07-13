"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, Download, Music, Palette, GripVertical, Image as ImageIcon,
  Trash2, Plus, Loader2, RotateCcw, AlertCircle, CheckCircle2, Upload,
} from "lucide-react";
import {
  VIDEO_THEMES, DEFAULT_THEME_ID, MUSIC_PRESETS,
  type ThemeId, type VideoTheme, type MusicPreset,
} from "../../lib/youtube/video-themes";
import { exportVideo, type EditorScene } from "../../lib/youtube/video-export";

// ────────────────────────────────────────────────────────────────────────────
// Editor state model
// ────────────────────────────────────────────────────────────────────────────

interface SceneRow extends EditorScene {
  scriptText?: string;
  environment?: string;
}

interface EditorState {
  scenes: SceneRow[];
  themeId: ThemeId;
  musicId: string | "none" | "custom";
  customMusicUrl?: string;
  narrationUrl?: string;
}

interface ProjectAPI {
  id: string;
  title?: string;
  scenes: Array<{
    id: string;
    sceneNumber: number;
    imageUrl?: string;
    duration: number;
    scriptText?: string;
    environment?: string;
  }>;
  assets: Array<{ type: string; url: string }>;
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function VideoEditor({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectAPI | null>(null);
  const [state, setState] = useState<EditorState | null>(null);

  // Load the project once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/youtube/projects/${projectId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const p: ProjectAPI = json.project;
        setProject(p);
        setState(initialStateFrom(p));
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading project…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        <AlertCircle className="inline w-4 h-4 mr-2" />Failed to load project: {loadError}
      </div>
    );
  }
  if (!project || !state || state.scenes.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-300 text-sm">
        <AlertCircle className="inline w-4 h-4 mr-2" />
        This project has no scene images yet. Run the visual generation stage first, then come back.
      </div>
    );
  }

  return <EditorShell project={project} state={state} setState={setState} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Editor shell (everything once data is loaded)
// ────────────────────────────────────────────────────────────────────────────

function EditorShell({
  project,
  state,
  setState,
}: {
  project: ProjectAPI;
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
}) {
  const theme = VIDEO_THEMES[state.themeId];
  const totalDuration = state.scenes.reduce((acc, s) => acc + Math.max(0.5, s.duration), 0);

  // Preview state.
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); // current time in seconds across the whole timeline
  const playStartRef = useRef<number | null>(null);
  const startOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Audio refs.
  const narrAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Export state.
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportLabel, setExportLabel] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Preload scene images so the preview is smooth.
  useEffect(() => {
    state.scenes.forEach((s) => {
      if (imagesRef.current.has(s.id)) return;
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = s.imageUrl;
      imagesRef.current.set(s.id, img);
    });
  }, [state.scenes]);

  // Resolve the active music URL (preset / custom / none).
  const musicUrl: string | undefined = useMemo(() => {
    if (state.musicId === "none") return undefined;
    if (state.musicId === "custom") return state.customMusicUrl;
    return MUSIC_PRESETS.find((m) => m.id === state.musicId)?.url;
  }, [state.musicId, state.customMusicUrl]);

  // Preview render loop.
  useEffect(() => {
    function draw(currentTime: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = theme.bgColor;
      ctx.fillRect(0, 0, w, h);

      const { scene, localT } = locateScene(state.scenes, currentTime);
      if (!scene) return;
      const img = imagesRef.current.get(scene.id);
      if (!img || !img.complete || img.naturalWidth === 0) return;

      const dur = Math.max(0.5, scene.duration);
      const progress = Math.min(1, localT / dur);
      const zoom = 1 + (theme.kenBurnsZoom - 1) * progress;

      drawCover(ctx, img, w, h, zoom);
      // Apply theme filter via 2D ctx.filter — best-effort match to FFmpeg.
      ctx.filter = theme.cssFilter;
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = "none";
    }

    function tick() {
      if (!playing) return;
      const elapsed = (performance.now() - (playStartRef.current ?? performance.now())) / 1000;
      const next = Math.min(totalDuration, startOffsetRef.current + elapsed);
      setT(next);
      draw(next);
      if (next >= totalDuration) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    if (playing) {
      playStartRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } else {
      draw(t);
    }

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, state.scenes, state.themeId, totalDuration]);

  // Sync audio to play/pause and seek.
  useEffect(() => {
    const narr = narrAudioRef.current;
    const music = musicAudioRef.current;
    if (narr) {
      narr.currentTime = Math.min(t, narr.duration || t);
      if (playing) narr.play().catch(() => {});
      else narr.pause();
    }
    if (music) {
      music.currentTime = Math.min(t, music.duration || t);
      music.volume = 0.18;
      music.loop = true;
      if (playing) music.play().catch(() => {});
      else music.pause();
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePlay() {
    if (!playing) {
      startOffsetRef.current = t >= totalDuration ? 0 : t;
      if (t >= totalDuration) setT(0);
    }
    setPlaying((p) => !p);
  }

  function seek(toSec: number) {
    setT(Math.max(0, Math.min(totalDuration, toSec)));
    if (playing) {
      startOffsetRef.current = toSec;
      playStartRef.current = performance.now();
    }
  }

  // ── Scene mutations ───────────────────────────────────────────────────────
  function updateScenes(mut: (prev: SceneRow[]) => SceneRow[]) {
    setState((s) => (s ? { ...s, scenes: mut(s.scenes) } : s));
  }
  function moveScene(idx: number, dir: -1 | 1) {
    updateScenes((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function setSceneDuration(idx: number, dur: number) {
    updateScenes((prev) => prev.map((s, i) => (i === idx ? { ...s, duration: dur } : s)));
  }
  function deleteScene(idx: number) {
    updateScenes((prev) => prev.filter((_, i) => i !== idx));
  }
  function swapSceneImage(idx: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      updateScenes((prevScenes) => {
        // Bust the cached HTMLImageElement so the new image actually loads.
        const targetId = prevScenes[idx]?.id;
        if (targetId) imagesRef.current.delete(targetId);
        return prevScenes.map((s, i) => (i === idx ? { ...s, imageUrl: dataUrl } : s));
      });
    };
    reader.readAsDataURL(file);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportUrl(null);
    setExportPct(0);
    setExportLabel("Loading FFmpeg…");
    try {
      const result = await exportVideo({
        scenes: state.scenes.map((s) => ({
          id: s.id, sceneNumber: s.sceneNumber, imageUrl: s.imageUrl, duration: s.duration,
        })),
        narrationUrl: state.narrationUrl,
        musicUrl,
        theme,
        onProgress: (pct, label) => { setExportPct(pct); setExportLabel(label); },
      });
      setExportUrl(result.url);
    } catch (e: any) {
      setExportError(String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  }

  function downloadExport() {
    if (!exportUrl) return;
    const a = document.createElement("a");
    a.href = exportUrl;
    a.download = `${(project.title || "video").replace(/[^a-z0-9_-]+/gi, "_")}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-slate-200">
      {/* Audio elements — hidden, just for preview sync */}
      {state.narrationUrl && (
        <audio ref={narrAudioRef} src={state.narrationUrl} preload="auto" className="hidden" />
      )}
      {musicUrl && (
        <audio ref={musicAudioRef} src={musicUrl} preload="auto" className="hidden" crossOrigin="anonymous" />
      )}

      {/* Preview */}
      <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
        <div className="aspect-video relative" style={{ backgroundColor: theme.bgColor }}>
          <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full" />
          {/* Soft theme name watermark */}
          <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-white/40 bg-black/30 px-2 py-0.5 rounded">
            {theme.name}
          </div>
        </div>
        {/* Transport */}
        <div className="flex items-center gap-3 p-3 border-t border-white/10 bg-black/60">
          <button onClick={togglePlay} className="p-2 rounded-full bg-white text-black hover:bg-white/90">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="text-xs font-mono w-20 tabular-nums">{fmtTime(t)} / {fmtTime(totalDuration)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.05}
            value={t}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="flex-1 accent-violet-400"
          />
        </div>
      </div>

      {/* Theme picker */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
          <Palette size={12} /> Theme
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.values(VIDEO_THEMES).map((th) => (
            <button
              key={th.id}
              onClick={() => setState((s) => (s ? { ...s, themeId: th.id } : s))}
              className={`text-left rounded-lg p-3 border transition ${
                state.themeId === th.id
                  ? "border-violet-400/60 bg-violet-500/10"
                  : "border-white/10 hover:border-white/20 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-white">{th.name}</p>
                {state.themeId === th.id && <CheckCircle2 size={12} className="text-violet-300" />}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{th.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Music picker */}
      <MusicSection
        state={state}
        setState={setState}
      />

      {/* Timeline */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-400">Timeline · {state.scenes.length} scenes · {fmtTime(totalDuration)}</p>
          <button
            onClick={() => setState((s) => (s && project ? initialStateFrom(project) : s))}
            className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
            title="Reset to original from the database"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>
        <div className="space-y-2">
          {state.scenes.map((s, idx) => (
            <SceneRowItem
              key={s.id}
              idx={idx}
              scene={s}
              isFirst={idx === 0}
              isLast={idx === state.scenes.length - 1}
              onMoveUp={() => moveScene(idx, -1)}
              onMoveDown={() => moveScene(idx, 1)}
              onDelete={() => deleteScene(idx)}
              onDuration={(d) => setSceneDuration(idx, d)}
              onSwapImage={(file) => swapSceneImage(idx, file)}
              onSeek={(localT) => {
                const before = state.scenes.slice(0, idx).reduce((a, x) => a + Math.max(0.5, x.duration), 0);
                seek(before + localT);
              }}
            />
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
          <Download size={12} /> Export
        </div>
        {!exporting && !exportUrl && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Encodes in your browser via FFmpeg (WASM). First run downloads ~30MB of core files; subsequent exports are instant to start.
            </p>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-medium shrink-0"
            >
              Export MP4
            </button>
          </div>
        )}
        {exporting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" /> {exportLabel}
              </span>
              <span className="text-slate-500 tabular-nums">{exportPct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-violet-400 transition-all" style={{ width: `${exportPct}%` }} />
            </div>
          </div>
        )}
        {!exporting && exportUrl && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={12} /> Export ready.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={downloadExport} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium">
                Download MP4
              </button>
              <button
                onClick={() => { setExportUrl(null); setExportPct(0); }}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs"
              >
                New export
              </button>
            </div>
          </div>
        )}
        {exportError && (
          <p className="mt-2 text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2">
            <AlertCircle className="inline w-3 h-3 mr-1" /> {exportError}
          </p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Music section
// ────────────────────────────────────────────────────────────────────────────

function MusicSection({
  state,
  setState,
}: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
}) {
  function setMusic(id: string | "none" | "custom", customUrl?: string) {
    setState((s) => (s ? { ...s, musicId: id, customMusicUrl: customUrl ?? s.customMusicUrl } : s));
  }
  function onUploadMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMusic("custom", String(reader.result || ""));
    reader.readAsDataURL(file);
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
        <Music size={12} /> Music
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <MusicTile
          active={state.musicId === "none"}
          name="No music"
          mood="Narration only"
          onClick={() => setMusic("none")}
        />
        {MUSIC_PRESETS.map((p) => (
          <MusicTile
            key={p.id}
            active={state.musicId === p.id}
            name={p.name}
            mood={p.mood}
            previewUrl={p.url}
            onClick={() => setMusic(p.id)}
          />
        ))}
        <label className={`rounded-lg p-3 border cursor-pointer transition flex flex-col justify-between ${
          state.musicId === "custom"
            ? "border-violet-400/60 bg-violet-500/10"
            : "border-dashed border-white/10 hover:border-white/20 bg-white/[0.02]"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-white flex items-center gap-1"><Upload size={11} /> Upload</p>
            {state.musicId === "custom" && <CheckCircle2 size={12} className="text-violet-300" />}
          </div>
          <p className="text-[10px] text-slate-500">Drop in your own .mp3</p>
          <input type="file" accept="audio/*" className="hidden" onChange={onUploadMusic} />
        </label>
      </div>
    </div>
  );
}

function MusicTile({
  active, name, mood, previewUrl, onClick,
}: {
  active: boolean; name: string; mood: string; previewUrl?: string; onClick: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  function preview(e: React.MouseEvent) {
    e.stopPropagation();
    if (!previewUrl) return;
    if (!audioRef.current) audioRef.current = new Audio(previewUrl);
    if (previewing) { audioRef.current.pause(); setPreviewing(false); }
    else { audioRef.current.play().catch(() => {}); setPreviewing(true); }
  }
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg p-3 border transition ${
        active ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 hover:border-white/20 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        {previewUrl && (
          <span
            role="button"
            tabIndex={0}
            onClick={preview}
            className="text-[10px] text-violet-300 hover:text-violet-200 px-1.5 py-0.5 rounded bg-violet-500/10 cursor-pointer"
          >
            {previewing ? "Stop" : "Preview"}
          </span>
        )}
        {!previewUrl && active && <CheckCircle2 size={12} className="text-violet-300" />}
      </div>
      <p className="text-[10px] text-slate-500 line-clamp-2">{mood}</p>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Scene row in the timeline
// ────────────────────────────────────────────────────────────────────────────

function SceneRowItem({
  idx, scene, isFirst, isLast,
  onMoveUp, onMoveDown, onDelete, onDuration, onSwapImage, onSeek,
}: {
  idx: number;
  scene: SceneRow;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDuration: (d: number) => void;
  onSwapImage: (f: File) => void;
  onSeek: (localT: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 p-2 hover:border-white/15 transition">
      <div className="flex flex-col">
        <button disabled={isFirst} onClick={onMoveUp} className="text-slate-500 hover:text-white disabled:opacity-20 text-[10px]">▲</button>
        <GripVertical size={12} className="text-slate-700" />
        <button disabled={isLast} onClick={onMoveDown} className="text-slate-500 hover:text-white disabled:opacity-20 text-[10px]">▼</button>
      </div>
      <div className="relative w-28 aspect-video rounded overflow-hidden bg-black/50 shrink-0 cursor-pointer" onClick={() => onSeek(0)}>
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700">
            <ImageIcon size={14} />
          </div>
        )}
        <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[9px] px-1 rounded">
          #{scene.sceneNumber}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 line-clamp-1">{scene.scriptText || scene.environment || `Scene ${idx + 1}`}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-500 w-16 tabular-nums">{scene.duration.toFixed(1)}s</span>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={scene.duration}
            onChange={(e) => onDuration(parseFloat(e.target.value))}
            className="flex-1 accent-violet-400 max-w-xs"
          />
        </div>
      </div>
      <label className="text-slate-500 hover:text-white cursor-pointer p-1.5 rounded hover:bg-white/5" title="Swap image">
        <Plus size={12} />
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSwapImage(f); }}
        />
      </label>
      <button onClick={onDelete} className="text-slate-600 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10" title="Remove scene">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function initialStateFrom(p: ProjectAPI): EditorState {
  const narration = p.assets?.find((a) => a.type === "AUDIO_NARRATION")?.url;
  const scenes: SceneRow[] = (p.scenes || [])
    .filter((s) => s.imageUrl)
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .map((s) => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      imageUrl: s.imageUrl as string,
      duration: Math.max(1.5, Number(s.duration) || 4),
      scriptText: s.scriptText,
      environment: s.environment,
    }));
  return {
    scenes,
    themeId: DEFAULT_THEME_ID,
    musicId: "none",
    narrationUrl: narration,
  };
}

function locateScene(scenes: SceneRow[], t: number): { scene: SceneRow | null; localT: number } {
  let acc = 0;
  for (const s of scenes) {
    const d = Math.max(0.5, s.duration);
    if (t < acc + d) return { scene: s, localT: t - acc };
    acc += d;
  }
  return { scene: scenes[scenes.length - 1] ?? null, localT: 0 };
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, zoom: number) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const targetAR = w / h;
  const imgAR = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (imgAR > targetAR) {
    // Image is wider — crop sides.
    sw = ih * targetAR;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / targetAR;
    sy = (ih - sh) / 2;
  }
  // Apply zoom by shrinking the source rect around its center.
  const z = Math.max(1, zoom);
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  const zw = sw / z;
  const zh = sh / z;
  sx = cx - zw / 2;
  sy = cy - zh / 2;
  ctx.drawImage(img, sx, sy, zw, zh, 0, 0, w, h);
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
