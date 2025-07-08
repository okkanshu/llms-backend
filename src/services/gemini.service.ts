import dotenv from "dotenv";
import { AIGeneratedContent, EnhancedMetadata } from "../types";

dotenv.config();

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  "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";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

if (!OPENROUTER_API_KEY) {
  console.warn("⚠️ OPENROUTER_API_KEY not found in environment variables");
}

async function callOpenRouter(
  messages: any[],
  temperature = 0.7,
  maxTokens = 256
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (response.status === 429) {
    // Rate limit hit
    const errorText = await response.text();
    throw new Error("RATE_LIMIT_REACHED: " + errorText);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export class OpenRouterService {
  /**
   * Generate a summary for a specific path
   */
  async generatePathSummary(path: string, content: string): Promise<string> {
    const prompt = `Generate a concise 1-2 sentence summary for this webpage content. Focus on the main purpose and key information.\n\nPath: ${path}\nContent: ${content.substring(
      0,
      2000
    )}...\n\nSummary:`;
    try {
      return await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
    } catch (error) {
      console.error("Error generating path summary:", error);
      return "Summary generation failed";
    }
  }

  /**
   * Generate context snippet for a path
   */
  async generateContextSnippet(path: string, content: string): Promise<string> {
    const prompt = `Generate a brief context snippet (2-3 sentences) that describes what this page is about and its key value proposition.\n\nPath: ${path}\nContent: ${content.substring(
      0,
      2000
    )}...\n\nContext Snippet:`;
    try {
      return await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
    } catch (error) {
      console.error("Error generating context snippet:", error);
      return "Context snippet generation failed";
    }
  }

  /**
   * Extract keywords from content
   */
  async extractKeywords(content: string): Promise<string[]> {
    const prompt = `Extract 5-10 relevant keywords from this content. Return only the keywords as a comma-separated list.\n\nContent: ${content.substring(
      0,
      2000
    )}...\n\nKeywords:`;
    try {
      const result = await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
      return result
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    } catch (error) {
      console.error("Error extracting keywords:", error);
      return [];
    }
  }

  /**
   * Determine content type
   */
  async determineContentType(path: string, content: string): Promise<string> {
    const prompt = `Based on the path and content, determine the content type. Choose from: page, blog, docs, project, archive, terms.\n\nPath: ${path}\nContent: ${content.substring(
      0,
      1000
    )}...\n\nContent Type:`;
    try {
      const result = await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
      const allowedTypes = [
        "page",
        "blog",
        "docs",
        "project",
        "archive",
        "terms",
      ];
      const type = result.toLowerCase();
      return allowedTypes.includes(type) ? type : "page";
    } catch (error) {
      console.error("Error determining content type:", error);
      return "page";
    }
  }

  /**
   * Determine priority level
   */
  async determinePriority(
    path: string,
    content: string
  ): Promise<"high" | "medium" | "low"> {
    const prompt = `Based on the path and content, determine the priority level for AI crawling. Consider factors like:\n- High: Main pages, important content, frequently accessed\n- Medium: Regular content pages\n- Low: Archive, terms, less important pages\n\nPath: ${path}\nContent: ${content.substring(
      0,
      1000
    )}...\n\nPriority (high/medium/low):`;
    try {
      const result = await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
      const value = result.toLowerCase();
      if (["high", "medium", "low"].includes(value)) return value as any;
      return "medium";
    } catch (error) {
      console.error("Error determining priority:", error);
      return "medium";
    }
  }

  /**
   * Suggest AI usage directive
   */
  async suggestAIUsageDirective(
    path: string,
    content: string
  ): Promise<"allow" | "citation-only" | "no-fine-tuning" | "disallow"> {
    const prompt = `Based on the path and content, suggest an AI usage directive:\n- allow: Standard content that can be freely used\n- citation-only: Content that should only be used for citations\n- no-fine-tuning: Content that can be used but not for training\n- disallow: Content that should not be used by AI\n\nPath: ${path}\nContent: ${content.substring(
      0,
      1000
    )}...\n\nDirective:`;
    try {
      const result = await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);
      const allowed = ["allow", "citation-only", "no-fine-tuning", "disallow"];
      const value = result.toLowerCase();
      return allowed.includes(value) ? (value as any) : "allow";
    } catch (error) {
      console.error("Error suggesting AI usage directive:", error);
      return "allow";
    }
  }

  /**
   * Generate comprehensive AI content for a path
   */
  async generateAIContent(
    path: string,
    content: string
  ): Promise<AIGeneratedContent> {
    try {
      const [
        summary,
        contextSnippet,
        keywords,
        contentType,
        priority,
        aiUsageDirective,
      ] = await Promise.all([
        this.generatePathSummary(path, content),
        this.generateContextSnippet(path, content),
        this.extractKeywords(content),
        this.determineContentType(path, content),
        this.determinePriority(path, content),
        this.suggestAIUsageDirective(path, content),
      ]);

      return {
        path,
        summary,
        contextSnippet,
        keywords,
        contentType,
        priority,
        aiUsageDirective,
        generatedAt: new Date().toISOString(),
        model: OPENROUTER_MODEL,
      };
    } catch (error) {
      console.error("Error generating AI content:", error);
      return {
        path,
        summary: "AI analysis failed",
        contextSnippet: "Context analysis failed",
        keywords: [],
        contentType: "page",
        priority: "medium",
        aiUsageDirective: "allow",
        generatedAt: new Date().toISOString(),
        model: OPENROUTER_MODEL,
      };
    }
  }

  /**
   * Enrich metadata with AI analysis
   */
  async enrichMetadata(
    title: string,
    description: string,
    content: string
  ): Promise<EnhancedMetadata> {
    try {
      const [keywords, contentType, priority, aiUsageDirective] =
        await Promise.all([
          this.extractKeywords(content),
          this.determineContentType("", content),
          this.determinePriority("", content),
          this.suggestAIUsageDirective("", content),
        ]);
      return {
        title,
        description,
        keywords,
        contentType,
        priority,
        aiUsageDirective,
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error enriching metadata:", error);
      return {
        title,
        description,
        keywords: [],
        contentType: "page",
        priority: "medium",
        aiUsageDirective: "allow",
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Generate hierarchical structure suggestions
   */
  async generateHierarchicalStructure(paths: string[]): Promise<
    Array<{
      group: string;
      paths: string[];
      description: string;
    }>
  > {
    if (!OPENROUTER_API_KEY) {
      return [];
    }

    try {
      const prompt = `Group these website paths into logical hierarchical sections. For each group, provide a name and description.\n\nPaths: ${paths.join(
        "\n"
      )}\n\nReturn as JSON array with format:\n[\n  {\n    "group": "Main Pages",\n    "paths": ["/", "/about", "/contact"],\n    "description": "Primary navigation pages"\n  }\n]`;

      const result = await callOpenRouter([
        {
          role: "system",
          content: "You are a helpful assistant for website content analysis.",
        },
        { role: "user", content: prompt },
      ]);

      const jsonMatch = result.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error("Error generating hierarchical structure:", error);
      return [];
    }
  }
}

export const openRouterService = new OpenRouterService();
