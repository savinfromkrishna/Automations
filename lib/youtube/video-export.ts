"use client";

// In-browser MP4 export via ffmpeg.wasm.
// Builds a final video from per-scene images + narration + optional music.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { VideoTheme } from "./video-themes";

const FFMPEG_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<FFmpeg> | null = null;

export async function getFFmpeg(onLog?: (m: string) => void): Promise<FFmpeg> {
  if (_ffmpeg && _ffmpeg.loaded) return _ffmpeg;
  if (_loading) return _loading;

  _loading = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    _ffmpeg = ff;
    return ff;
  })();
  return _loading;
}

export interface EditorScene {
  id: string;
  sceneNumber: number;
  imageUrl: string; // data: URL or http(s)
  duration: number; // seconds
}

export interface ExportOptions {
  scenes: EditorScene[];
  narrationUrl?: string;        // single project-wide narration (data: URL or http)
  musicUrl?: string;            // background music (data: URL or http)
  musicVolume?: number;         // 0..1, default 0.18
  theme: VideoTheme;
  width?: number;               // default 1280
  height?: number;              // default 720
  fps?: number;                 // default 30
  onProgress?: (pct: number, label: string) => void;
  onLog?: (line: string) => void;
}

export interface ExportResult {
  blob: Blob;
  url: string; // object URL — caller is responsible for revoking
  durationSec: number;
}

// Build an FFmpeg filter_complex that:
//   • takes each input image, applies Ken-Burns zoom over its duration
//   • applies the theme's color filter
//   • crossfades / cuts / fades between scenes per theme.transition
//   • scales/pads to the target resolution
//
// Audio mix:
//   • narration at 1.0 gain
//   • music at musicVolume gain, looped, ducked under narration where present
export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 30;
  const musicVolume = Math.max(0, Math.min(1, opts.musicVolume ?? 0.18));
  const theme = opts.theme;

  const ff = await getFFmpeg(opts.onLog);
  opts.onProgress?.(5, "FFmpeg loaded");

  // Write inputs to the in-memory FS.
  const inputImageNames: string[] = [];
  for (let i = 0; i < opts.scenes.length; i++) {
    const s = opts.scenes[i];
    const ext = guessImageExt(s.imageUrl);
    const name = `scene_${String(i).padStart(3, "0")}.${ext}`;
    await ff.writeFile(name, await fetchFile(s.imageUrl));
    inputImageNames.push(name);
    opts.onProgress?.(5 + Math.round((25 * (i + 1)) / opts.scenes.length), `Loaded scene ${i + 1}`);
  }

  let narrationName: string | undefined;
  if (opts.narrationUrl) {
    narrationName = "narration." + guessAudioExt(opts.narrationUrl);
    await ff.writeFile(narrationName, await fetchFile(opts.narrationUrl));
  }
  let musicName: string | undefined;
  if (opts.musicUrl) {
    musicName = "music." + guessAudioExt(opts.musicUrl);
    try {
      await ff.writeFile(musicName, await fetchFile(opts.musicUrl));
    } catch (e) {
      console.warn("[Export] Failed to fetch music — proceeding without it.", e);
      musicName = undefined;
    }
  }
  opts.onProgress?.(35, "Inputs written");

  const totalDuration = opts.scenes.reduce((acc, s) => acc + Math.max(0.5, s.duration), 0);
  const transitionDur = Math.min(theme.transitionDurationSec, 1.0);

  // Build FFmpeg args.
  const args: string[] = [];
  for (let i = 0; i < inputImageNames.length; i++) {
    const s = opts.scenes[i];
    const d = Math.max(0.5, s.duration);
    args.push("-loop", "1", "-t", String(d), "-i", inputImageNames[i]);
  }
  if (narrationName) args.push("-i", narrationName);
  if (musicName) args.push("-stream_loop", "-1", "-t", String(totalDuration), "-i", musicName);

  // Build filter_complex — per-scene Ken-Burns + theme filter + concat/xfade.
  const filterParts: string[] = [];
  for (let i = 0; i < opts.scenes.length; i++) {
    const d = Math.max(0.5, opts.scenes[i].duration);
    const frames = Math.max(1, Math.round(d * fps));
    const zoomEnd = theme.kenBurnsZoom;
    // zoompan: zoom from 1.0 to zoomEnd over `frames` frames, then scale+pad to canvas.
    filterParts.push(
      `[${i}:v]scale=${width * 2}:-2,zoompan=z='min(zoom+0.0006,${zoomEnd})':d=${frames}:s=${width}x${height}:fps=${fps},setsar=1,${theme.ffmpegFilter},format=yuv420p[v${i}]`
    );
  }

  // Concat or xfade.
  let lastLabel = "v0";
  if (opts.scenes.length === 1) {
    filterParts.push(`[v0]copy[vout]`);
    lastLabel = "vout";
  } else if (theme.transition === "cut") {
    const inputs = opts.scenes.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${inputs}concat=n=${opts.scenes.length}:v=1:a=0[vout]`);
    lastLabel = "vout";
  } else {
    // Crossfade or fade — chain xfade between successive scenes.
    let cumulative = 0;
    let prev = "v0";
    for (let i = 1; i < opts.scenes.length; i++) {
      cumulative += Math.max(0.5, opts.scenes[i - 1].duration) - transitionDur;
      const offset = Math.max(0, cumulative);
      const out = i === opts.scenes.length - 1 ? "vout" : `vx${i}`;
      const trans = theme.transition === "fade" ? "fade" : "fade"; // ffmpeg xfade transition name
      filterParts.push(`[${prev}][v${i}]xfade=transition=${trans}:duration=${transitionDur}:offset=${offset}[${out}]`);
      prev = out;
    }
    lastLabel = "vout";
  }

  // Audio mix.
  const audioInputBase = opts.scenes.length; // images occupy [0..n-1]
  const hasNarr = !!narrationName;
  const hasMusic = !!musicName;
  let audioLabel: string | undefined;

  if (hasNarr && hasMusic) {
    const narrIdx = audioInputBase;
    const musicIdx = audioInputBase + 1;
    filterParts.push(`[${narrIdx}:a]aresample=44100,apad=pad_dur=${totalDuration}[narr]`);
    filterParts.push(`[${musicIdx}:a]aresample=44100,volume=${musicVolume}[mus]`);
    filterParts.push(`[narr][mus]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1[aout]`);
    audioLabel = "aout";
  } else if (hasNarr) {
    const narrIdx = audioInputBase;
    filterParts.push(`[${narrIdx}:a]aresample=44100,apad=pad_dur=${totalDuration}[aout]`);
    audioLabel = "aout";
  } else if (hasMusic) {
    const musicIdx = audioInputBase;
    filterParts.push(`[${musicIdx}:a]aresample=44100,volume=${musicVolume}[aout]`);
    audioLabel = "aout";
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${lastLabel}]`);
  if (audioLabel) args.push("-map", `[${audioLabel}]`);
  args.push("-r", String(fps));
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-crf", "23");
  if (audioLabel) args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  args.push("-t", String(totalDuration));
  args.push("output.mp4");

  // Progress wiring.
  const handleProgress = ({ progress }: { progress: number }) => {
    const pct = 35 + Math.round(60 * Math.max(0, Math.min(1, progress)));
    opts.onProgress?.(pct, `Encoding ${Math.round(progress * 100)}%`);
  };
  ff.on("progress", handleProgress);

  try {
    await ff.exec(args);
  } finally {
    ff.off("progress", handleProgress);
  }
  opts.onProgress?.(96, "Reading output");

  const data = await ff.readFile("output.mp4");
  const blob = new Blob([data as Uint8Array], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  opts.onProgress?.(100, "Done");

  // Clean up FS to keep memory bounded for the next export.
  for (const n of inputImageNames) await ff.deleteFile(n).catch(() => {});
  if (narrationName) await ff.deleteFile(narrationName).catch(() => {});
  if (musicName) await ff.deleteFile(musicName).catch(() => {});
  await ff.deleteFile("output.mp4").catch(() => {});

  return { blob, url, durationSec: totalDuration };
}

function guessImageExt(url: string): string {
  if (url.startsWith("data:")) {
    const m = /^data:image\/([a-z0-9+]+)/i.exec(url);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  }
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(url);
  return (m?.[1] ?? "png").toLowerCase();
}

function guessAudioExt(url: string): string {
  if (url.startsWith("data:")) {
    const m = /^data:audio\/([a-z0-9+]+)/i.exec(url);
    if (m) return m[1].toLowerCase().replace("mpeg", "mp3");
  }
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(url);
  return (m?.[1] ?? "mp3").toLowerCase();
}
