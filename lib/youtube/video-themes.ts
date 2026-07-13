// Visual themes for the YouTube video editor. Each theme defines:
//   • cssFilter   — what to apply to the live <canvas>/<img> during preview
//   • ffmpegFilter — equivalent FFmpeg filter chain for the final export
//   • transition  — how scenes blend at the export stage
//
// Keep cssFilter and ffmpegFilter visually close so preview ≈ export.

export type ThemeId = "cinematic" | "vibrant" | "minimal" | "moody";

export interface VideoTheme {
  id: ThemeId;
  name: string;
  description: string;
  cssFilter: string;
  ffmpegFilter: string;
  transition: "crossfade" | "cut" | "fade";
  transitionDurationSec: number;
  kenBurnsZoom: number;
  bgColor: string;
}

export const VIDEO_THEMES: Record<ThemeId, VideoTheme> = {
  cinematic: {
    id: "cinematic",
    name: "Cinematic",
    description: "Warm filmic grade, soft crossfades, slow Ken-Burns.",
    cssFilter: "contrast(1.12) saturate(1.05) brightness(0.96) sepia(0.08)",
    ffmpegFilter: "eq=contrast=1.12:saturation=1.05:brightness=-0.02,curves=preset=increase_contrast",
    transition: "crossfade",
    transitionDurationSec: 0.6,
    kenBurnsZoom: 1.08,
    bgColor: "#0a0a0f",
  },
  vibrant: {
    id: "vibrant",
    name: "Vibrant",
    description: "High saturation, punchy contrast, snappy cuts.",
    cssFilter: "contrast(1.18) saturate(1.45) brightness(1.02)",
    ffmpegFilter: "eq=contrast=1.18:saturation=1.45:brightness=0.02",
    transition: "cut",
    transitionDurationSec: 0.15,
    kenBurnsZoom: 1.05,
    bgColor: "#0b0014",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Clean and bright, low contrast, gentle fades.",
    cssFilter: "contrast(0.95) saturate(0.85) brightness(1.06)",
    ffmpegFilter: "eq=contrast=0.95:saturation=0.85:brightness=0.06",
    transition: "fade",
    transitionDurationSec: 0.5,
    kenBurnsZoom: 1.03,
    bgColor: "#f5f5f5",
  },
  moody: {
    id: "moody",
    name: "Moody",
    description: "Deep shadows, desaturated blues, deliberate pacing.",
    cssFilter: "contrast(1.22) saturate(0.7) brightness(0.85) hue-rotate(-8deg)",
    ffmpegFilter: "eq=contrast=1.22:saturation=0.7:brightness=-0.08,hue=h=-8",
    transition: "crossfade",
    transitionDurationSec: 0.8,
    kenBurnsZoom: 1.1,
    bgColor: "#05070d",
  },
};

export const DEFAULT_THEME_ID: ThemeId = "cinematic";

// Royalty-free preset music tracks. Each entry is a direct .mp3 URL — Pixabay's
// public CDN serves these without auth. Users can also upload their own track.
// If any URL becomes unreachable, the picker falls through to "No music".
export interface MusicPreset {
  id: string;
  name: string;
  mood: string;
  url: string;
}

export const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: "cinematic-ambient",
    name: "Cinematic Ambient",
    mood: "Slow, atmospheric, contemplative",
    url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347111d654.mp3",
  },
  {
    id: "lofi-chill",
    name: "Lo-fi Chill",
    mood: "Relaxed beats, mellow keys",
    url: "https://cdn.pixabay.com/audio/2024/02/22/audio_2f5b5acf69.mp3",
  },
  {
    id: "uplift-corporate",
    name: "Uplifting",
    mood: "Bright, hopeful, motivational",
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3",
  },
  {
    id: "epic-tension",
    name: "Epic Tension",
    mood: "Driving percussion, building stakes",
    url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3",
  },
];
