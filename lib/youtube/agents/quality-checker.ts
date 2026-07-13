import type { QualityReport, GeneratedScript, SeoPackage } from "../types";

// All inputs to quality-check are already numbers or short strings —
// scoring them through an LLM was waste. Same outputs from formulas.
export async function runQualityCheckerAgent(
  script: GeneratedScript,
  seo: SeoPackage,
  sceneCount: number,
  generatedAssetCount: number
): Promise<QualityReport> {
  const scriptQuality = clamp(
    (script.retentionScore ?? 75) * 0.4 +
    (script.emotionScore ?? 75) * 0.4 +
    (script.originalityScore ?? 70) * 0.2
  );

  const hookBonus = hookHasImpact(script.hook, script.hookType) ? 5 : 0;
  const lengthBonus = script.wordCount && script.wordCount > 200 ? 3 : 0;
  const sectionsBonus = script.sections.length >= 6 ? 4 : 0;

  const emotionalDepth = clamp((script.emotionScore ?? 75) + hookBonus);

  const retentionPotential = clamp(
    (script.retentionScore ?? 75) + hookBonus + sectionsBonus +
    (script.tensionPoints.length >= 3 ? 4 : 0)
  );

  const titleLenScore = scoreTitleLength(seo.title.length);
  const descLenScore  = scoreDescLength(seo.description.length);
  const tagsScore     = scoreTagCount(seo.tags.length);
  const ctrScore      = clamp((seo.ctrPrediction ?? 5) * 10);

  const seoStrength = clamp(titleLenScore * 0.25 + descLenScore * 0.25 + tagsScore * 0.2 + ctrScore * 0.3);

  const expectedScenes = Math.max(8, Math.round(script.estimatedDuration / 30));
  const sceneCoverage = sceneCount > 0 ? Math.min(1, sceneCount / expectedScenes) : 0;
  const assetCoverage = sceneCount > 0 ? Math.min(1, generatedAssetCount / sceneCount) : 0;
  const visualCoherence = clamp(60 + sceneCoverage * 25 + assetCoverage * 15);

  const originalityScore = clamp(
    (script.originalityScore ?? 70) +
    (containsCliche(script.hook) ? -8 : 5) +
    lengthBonus
  );

  const overallScore = clamp(
    scriptQuality * 0.25 +
    emotionalDepth * 0.2 +
    retentionPotential * 0.2 +
    seoStrength * 0.15 +
    visualCoherence * 0.1 +
    originalityScore * 0.1
  );

  const issues: QualityReport["issues"] = [];

  if (seo.title.length > 70) {
    issues.push({ severity: "MEDIUM", area: "SEO",
      description: `Title is ${seo.title.length} chars (recommend ≤60)`,
      suggestion: "Shorten the title — YouTube truncates at ~60 chars on mobile." });
  }
  if (seo.title.length < 30) {
    issues.push({ severity: "LOW", area: "SEO",
      description: `Title is only ${seo.title.length} chars — may underperform`,
      suggestion: "Expand to 50-60 chars with curiosity + keyword." });
  }
  if (seo.description.length < 200) {
    issues.push({ severity: "MEDIUM", area: "SEO",
      description: `Description is only ${seo.description.length} chars`,
      suggestion: "Aim for 300+ words; first 2 lines are the hook." });
  }
  if (seo.tags.length < 10) {
    issues.push({ severity: "LOW", area: "SEO",
      description: `Only ${seo.tags.length} tags`,
      suggestion: "Add tags for broader discoverability (target 15-20)." });
  }
  if (sceneCount < expectedScenes) {
    issues.push({ severity: "MEDIUM", area: "VISUAL",
      description: `${sceneCount} scenes vs ${expectedScenes} expected`,
      suggestion: "Add scenes for the remaining duration." });
  }
  if (sceneCount > 0 && generatedAssetCount < sceneCount) {
    issues.push({
      severity: generatedAssetCount === 0 ? "HIGH" : "MEDIUM",
      area: "VISUAL",
      description: `${generatedAssetCount}/${sceneCount} scenes have images`,
      suggestion: "Re-run Visual Generation stage for missing scenes.",
    });
  }
  if (containsCliche(script.hook)) {
    issues.push({ severity: "LOW", area: "SCRIPT",
      description: "Hook uses generic phrasing",
      suggestion: "Replace with a concrete image or surprising statement." });
  }
  if ((script.retentionScore ?? 0) < 70) {
    issues.push({ severity: "MEDIUM", area: "SCRIPT",
      description: `Self-rated retention score ${script.retentionScore}/100`,
      suggestion: "Add more pattern interrupts and tension build-ups." });
  }

  const improvements: string[] = [];
  if (overallScore < 80) improvements.push("Sharpen the hook with a concrete sensory image in the first 5 seconds.");
  if (seoStrength < 75) improvements.push("Add 2-3 trend keywords to the title and first description line.");
  if (visualCoherence < 80) improvements.push("Generate remaining scene visuals before publishing.");
  if (emotionalDepth < 80) improvements.push("Layer in one more emotional turn before the payoff.");
  if (improvements.length === 0) improvements.push("Quality is strong — consider A/B testing the thumbnail.");

  return {
    overallScore: Math.round(overallScore),
    scriptQuality: Math.round(scriptQuality),
    visualCoherence: Math.round(visualCoherence),
    emotionalDepth: Math.round(emotionalDepth),
    retentionPotential: Math.round(retentionPotential),
    seoStrength: Math.round(seoStrength),
    originalityScore: Math.round(originalityScore),
    issues,
    improvements,
    approved: overallScore >= 70,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function scoreTitleLength(len: number): number {
  if (len >= 50 && len <= 60) return 95;
  if (len >= 40 && len <= 70) return 85;
  if (len >= 30 && len <= 80) return 70;
  return 50;
}

function scoreDescLength(len: number): number {
  if (len >= 300 && len <= 2000) return 90;
  if (len >= 200) return 75;
  if (len >= 100) return 60;
  return 40;
}

function scoreTagCount(n: number): number {
  if (n >= 12 && n <= 20) return 90;
  if (n >= 8) return 75;
  if (n >= 5) return 60;
  return 40;
}

function hookHasImpact(hook: string, type: string): boolean {
  if (!hook) return false;
  const h = hook.toLowerCase();
  if (type === "question" && hook.includes("?")) return true;
  if (type === "shocking" && /\b(never|nobody|always|everyone|forever|impossible)\b/.test(h)) return true;
  if (hook.length >= 20 && hook.length <= 200) return true;
  return false;
}

const CLICHES = [
  "have you ever wondered",
  "in this video",
  "today we",
  "let me tell you",
  "buckle up",
  "you won't believe",
  "the secret to",
];

function containsCliche(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return CLICHES.some(c => t.includes(c));
}
