export type NodeStatus = "idle" | "running" | "done" | "error" | "skipped";

export type NodeRole =
  | "input" | "crawl" | "extract" | "write" | "refine" | "image" | "video"
  | "compare" | "output"
  | "faq" | "schema" | "social" | "translate" | "summarize" | "tts" | "publish";

export type TeamMemberInfo = {
  id: number;
  role: string;
  model_id: string;
  model_label: string;
  priority: number;
  is_active: boolean;
};

export type TeamInfo = {
  id: number;
  name: string;
  task_type: string;
  members: TeamMemberInfo[];
};

export type NodeData = {
  role: NodeRole;
  label: string;
  model?: string;
  teamId?: number;
  teamName?: string;
  status: NodeStatus;
  config?: Record<string, any>;
  output?: any;
  errorMsg?: string;
  meta?: string;
} & Record<string, unknown>;

export const ROLE_META: Record<NodeRole, { color: string; bg: string; ring: string; tagline: string }> = {
  input:   { color: "#a3a3b8", bg: "rgba(163,163,184,0.12)", ring: "rgba(163,163,184,0.4)", tagline: "Source URL & parameters" },
  crawl:   { color: "#34d399", bg: "rgba(52,211,153,0.12)", ring: "rgba(52,211,153,0.4)", tagline: "Sitemap + on-page crawl" },
  extract: { color: "#ff6d5a", bg: "rgba(255,109,90,0.12)", ring: "rgba(255,109,90,0.4)", tagline: "Structured insights" },
  write:   { color: "#ea4b71", bg: "rgba(234,75,113,0.12)", ring: "rgba(234,75,113,0.4)", tagline: "Long-form drafting" },
  refine:  { color: "#ff8b4a", bg: "rgba(255,139,74,0.12)", ring: "rgba(255,139,74,0.4)", tagline: "SEO polish" },
  image:   { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", ring: "rgba(96,165,250,0.4)", tagline: "Image synthesis" },
  video:   { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", ring: "rgba(167,139,250,0.4)", tagline: "Video synthesis" },
  compare: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", ring: "rgba(251,191,36,0.4)", tagline: "Secondary writer" },
  output:  { color: "#f5f5f7", bg: "rgba(245,245,247,0.10)", ring: "rgba(245,245,247,0.35)", tagline: "Final article" },
  faq:     { color: "#22d3ee", bg: "rgba(34,211,238,0.12)", ring: "rgba(34,211,238,0.4)", tagline: "Generate FAQ section" },
  schema:  { color: "#a3e635", bg: "rgba(163,230,53,0.12)", ring: "rgba(163,230,53,0.4)", tagline: "JSON-LD schema markup" },
  social:  { color: "#f472b6", bg: "rgba(244,114,182,0.12)", ring: "rgba(244,114,182,0.4)", tagline: "Twitter / LinkedIn / IG" },
  translate:{ color: "#38bdf8", bg: "rgba(56,189,248,0.12)", ring: "rgba(56,189,248,0.4)", tagline: "Multilingual translation" },
  summarize:{ color: "#facc15", bg: "rgba(250,204,21,0.12)", ring: "rgba(250,204,21,0.4)", tagline: "TL;DR generator" },
  tts:     { color: "#fb923c", bg: "rgba(251,146,60,0.12)", ring: "rgba(251,146,60,0.4)", tagline: "Audio narration (TTS)" },
  publish: { color: "#10b981", bg: "rgba(16,185,129,0.12)", ring: "rgba(16,185,129,0.4)", tagline: "Save to database" },
};
