// YouTube Automation Platform — Core Types

export type ProjectStatus =
  | 'IDEA' | 'RESEARCHING' | 'SCRIPTING' | 'STORYBOARDING'
  | 'GENERATING_VISUALS' | 'GENERATING_AUDIO' | 'EDITING'
  | 'QUALITY_CHECK' | 'THUMBNAIL_CREATION' | 'SEO_OPTIMIZATION'
  | 'READY_TO_PUBLISH' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'PAUSED';

export type AssetType = 'IMAGE' | 'VIDEO' | 'AUDIO_NARRATION' | 'AUDIO_MUSIC' | 'AUDIO_SFX' | 'THUMBNAIL' | 'FINAL_VIDEO';
export type MemoryType = 'HOOK' | 'STYLE' | 'METAPHOR' | 'THUMBNAIL' | 'PACING' | 'AUDIENCE' | 'VISUAL' | 'SEO';
export type SceneType = 'HOOK' | 'INTRO' | 'MAIN' | 'CLIMAX' | 'RESOLUTION' | 'OUTRO';

export interface TrendIdea {
  title: string;
  concept: string;
  hook: string;
  emotionalAngle: string;
  targetEmotion: string;
  metaphorSeed: string;
  trendScore: number;      // 0-100
  viralityScore: number;   // 0-100
  competitionScore: number; // 0-100 (lower = better opportunity)
  opportunityScore: number; // 0-100
  keywords: string[];
  sourceSignals: string;
}

export interface NicheBlueprint {
  psychologicalProfile: string;
  coreDesires: string[];
  painPoints: string[];
  emotionalTriggers: string[];
  successfulPatterns: string[];
  visualLanguage: string;
  pacingPreferences: string;
  hookStyles: string[];
  audienceJourney: string;
}

export interface InsightSet {
  coreInsight: string;
  philosophicalLayer: string;
  psychologicalAngle: string;
  contradictions: string[];
  symbolism: string;
  emotionalTruth: string;
  uniquePerspectives: string[];
  narrativeHook: string;
}

export interface MetaphorMap {
  centralMetaphor: string;
  visualSymbol: string;
  emotionalEnvironment: string;
  recurringElements: MetaphorElement[];
  colorPsychology: string;
  lightingMood: string;
  soundscapeTheme: string;
  narrativeArchetype: string;
}

export interface MetaphorElement {
  concept: string;
  symbol: string;
  visualRepresentation: string;
  emotionalMeaning: string;
}

export interface ScriptSection {
  sectionId: string;
  type: SceneType;
  title: string;
  narration: string;
  emotionalBeat: string;
  duration: number; // seconds
  startTime: number;
  visualNote: string;
  tensionLevel: number; // 1-10
}

export interface GeneratedScript {
  hook: string;
  hookType: string;
  fullScript: string;
  sections: ScriptSection[];
  wordCount: number;
  estimatedDuration: number; // seconds
  emotionalArc: EmotionalArcPoint[];
  tensionPoints: TensionPoint[];
  retentionScore: number;
  emotionScore: number;
  originalityScore: number;
}

export interface EmotionalArcPoint {
  timePercent: number;
  emotion: string;
  intensity: number; // 1-10
}

export interface TensionPoint {
  timePercent: number;
  description: string;
  type: 'buildup' | 'release' | 'twist' | 'revelation';
}

export interface StoryboardScene {
  sceneNumber: number;
  type: SceneType;
  scriptText: string;
  visualPrompt: string;
  duration: number;
  startTime: number;
  cameraDirection: string;
  lightingNotes: string;
  transition: string;
  environment: string;
  metaphorElement: string;
  emotionalBeat: string;
}

export interface GeneratedStoryboard {
  totalScenes: number;
  totalDuration: number;
  visualStyle: string;
  colorGrading: string;
  motionStyle: string;
  transitionStyle: string;
  paceNotes: string;
  scenes: StoryboardScene[];
}

export interface SeoPackage {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  chapters: ChapterMark[];
  primaryKeyword: string;
  keywordClusters: string[][];
  ctrPrediction: number;
  searchVolume: string;
  thumbnailConcept: string;
  thumbnailText: string;
  thumbnailEmotion: string;
}

export interface ChapterMark {
  timestamp: string;
  title: string;
}

export interface QualityReport {
  overallScore: number;
  scriptQuality: number;
  visualCoherence: number;
  emotionalDepth: number;
  retentionPotential: number;
  seoStrength: number;
  originalityScore: number;
  issues: QualityIssue[];
  improvements: string[];
  approved: boolean;
}

export interface QualityIssue {
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  area: string;
  description: string;
  suggestion: string;
}

export interface ChannelMemory {
  type: MemoryType;
  key: string;
  value: string;
  confidence: number;
  usageCount: number;
  successRate?: number;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  retryCount: number;
}

export interface PipelineContext {
  channelId: string;
  projectId: string;
  niche: string;
  subNiche?: string;
  tone: string;
  style: string;
  targetAudience?: string;
  brandVoice?: string;
  visualStyle?: string;
  preferredDuration: number;
  memories: ChannelMemory[];
}
