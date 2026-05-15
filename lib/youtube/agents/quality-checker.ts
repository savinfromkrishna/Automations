import { ytLLMJson, YT_MODELS } from "../synthesize";
import type { QualityReport, GeneratedScript, SeoPackage } from "../types";

export async function runQualityCheckerAgent(
  script: GeneratedScript,
  seo: SeoPackage,
  sceneCount: number,
  generatedAssetCount: number
): Promise<QualityReport> {
  const prompt = `You are the Quality Assurance Director at a premium YouTube production studio. Conduct a rigorous quality assessment.

SCRIPT METRICS:
- Word count: ${script.wordCount}
- Estimated duration: ${Math.round(script.estimatedDuration / 60)} min
- Retention score (self-assessed): ${script.retentionScore}/100
- Emotion score (self-assessed): ${script.emotionScore}/100
- Originality score (self-assessed): ${script.originalityScore}/100
- Hook type: ${script.hookType}
- Hook text: "${script.hook.substring(0, 150)}"
- Sections: ${script.sections.length}
- Tension points: ${script.tensionPoints.length}

SEO METRICS:
- Title: "${seo.title}"
- Title length: ${seo.title.length} chars
- Description length: ${seo.description.length} chars
- Tags count: ${seo.tags.length}
- CTR prediction: ${seo.ctrPrediction}%
- Primary keyword: ${seo.primaryKeyword}

PRODUCTION STATUS:
- Total scenes planned: ${sceneCount}
- Assets generated: ${generatedAssetCount}

EVALUATE:
1. Script quality — does the hook work? Is the emotional arc compelling? Is it original?
2. Visual coherence — are there enough scenes for the duration?
3. SEO strength — will this rank? Does the title create CTR?
4. Originality — does this avoid AI clichés?
5. Retention potential — will viewers stay until the end?

Return JSON:
{
  "overallScore": 85,
  "scriptQuality": 88,
  "visualCoherence": 82,
  "emotionalDepth": 90,
  "retentionPotential": 85,
  "seoStrength": 78,
  "originalityScore": 80,
  "issues": [
    {
      "severity": "MEDIUM",
      "area": "SCRIPT|SEO|VISUAL|AUDIO",
      "description": "specific issue description",
      "suggestion": "specific actionable fix"
    }
  ],
  "improvements": ["specific improvement 1", "specific improvement 2", "specific improvement 3"],
  "approved": true
}

Score honestly. Approved if overallScore >= 70.`;

  return ytLLMJson<QualityReport>(prompt, YT_MODELS.QUALITY);
}
