import { GenerationResult, Post } from "@/lib/types";

async function callNeuralNexus(
  prompt: string,
  model: string = "meta-llama/Llama-3.3-70B-Instruct",
  config: any = {}
) {
  const resp = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, config }),
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || "Neural Nexus connection failed");
  }

  const data = await resp.json();
  return data.text;
}

export async function generateAutomatedContent(inputs: {
  url: string;
  niche: string;
  audience: string;
  tone: string;
  urlContext: string;
  existingPosts: string;
  tables: string;
  model?: string;
}): Promise<GenerationResult> {
  const model = inputs.model || "meta-llama/Llama-3.3-70B-Instruct";

  const prompt = `
    You are a world-class content architect and niche analyst.
    Using the provided context, perform a "Deep Scan" synthesis of the target topic.

    SYSTEM CAPABILITIES ENABLED:
    - [NETWORK_INTELLIGENCE]: High-reasoning neural pathways activated.
    - [GOOGLE_SEARCH]: Live grounding on current trends and data.
    - [URL_CONTEXT_SYNC]: Deep analysis of provided site content.

    TARGET PARAMETERS:
    URL/Context: ${inputs.url}
    Niche: ${inputs.niche}
    Audience: ${inputs.audience}
    Tone: ${inputs.tone}
    Live Scanned Content: ${inputs.urlContext}

    Instructions:
    1. Analyze the Live Scanned Content for unique insights, data points, and semantic patterns.
    2. Use Google Search to find competitive gaps or trending sub-topics in the "${inputs.niche}" space.
    3. Construct a strictly structured long-form article (8-12 sections).
    4. For each section, define a high-resolution, photorealistic image prompt for visual synthesis.

    Return a JSON object that matches exactly this structure:
    {
      "post": {
        "title": "...",
        "slug": "...",
        "meta_description": "...",
        "featured_image_prompt": "Ultra-realistic, high-concept visual representing...",
        "featured_image_url": null,
        "reading_time": "7",
        "created_at": "${new Date().toISOString()}",
        "status": "draft",
        "published_at": null
      },
      "sections": [
        { "heading": "...", "content_html": "...", "order_index": 0 }
      ],
      "images": [
        { "section_heading_ref": "...", "prompt": "Cinematic, detailed photography showing...", "alt_text": "..." }
      ],
      "internal_links": [
        { "anchor_text": "...", "target_slug": "..." }
      ],
      "keywords": [
        { "keyword": "..." }
      ],
      "categories": [
        { "name": "..." }
      ],
      "products": [
        { "name": "...", "price": "$...", "description": "..." }
      ]
    }
  `;

  const text = await callNeuralNexus(prompt, model, { responseMimeType: "application/json" });
  return JSON.parse(text);
}

export async function regenerateSection(
  postContext: Post,
  sectionHeading: string,
  tone: string,
  model: string = "meta-llama/Llama-3.3-70B-Instruct"
) {
  const prompt = `
    You are a professional content architect. We need to regenerate a specific section of a blog post.

    POST TITLE: ${postContext.title}
    TARGET SECTION HEADING: ${sectionHeading}
    TONE: ${tone}

    Please provide ONLY the content_html for this section. Use proper HTML tags (<p>, <ul>, <li>, <strong>).
    The content should be approximately 300-500 words, highly analytical and professional.

    JSON RESPONSE FORMAT:
    {
      "content_html": "..."
    }
  `;

  const text = await callNeuralNexus(prompt, model, { responseMimeType: "application/json" });
  return JSON.parse(text) as { content_html: string };
}

export async function refineContent(
  result: GenerationResult,
  model: string = "meta-llama/Llama-3.3-70B-Instruct"
): Promise<GenerationResult> {
  const prompt = `
    You are an expert SEO editor and content strategist.
    Review the following blog post structure and refine it for maximum readability, SEO impact, and engagement.

    CRITICAL STRUCTURAL TRANSFORMS:
    1. READABILITY:
       - Break up paragraphs longer than 3 sentences.
       - Use semantic HTML bullet points (<ul><li>) for lists, features, or complex items.
       - Use <strong> tags sparingly to highlight core concepts.
    2. SEO SUPREMACY:
       - REWRITE the post's meta_description to be between 150-160 characters. It must be a high-conversion "hook" including primary keywords.
       - REWRITE all image alt_texts to be descriptive, specifically mentioning keywords related to the niche: "${result.post.title}".
    3. INTERNAL PATHS:
       - Ensure internal_link anchor texts are high-CTR phrases (e.g., "Mastering Demand Sensing" instead of "Read more").
    4. TONAL HARMONY:
       - Ensure the tone is authoritative but approachable. No jargon without explanation.

    CURRENT POST DATA:
    ${JSON.stringify(result, null, 2)}

    Return the FULL refined GenerationResult object in the same JSON format. Ensure all HTML in content_html remains valid and improved.
  `;

  const text = await callNeuralNexus(prompt, model, { responseMimeType: "application/json" });
  return JSON.parse(text);
}
