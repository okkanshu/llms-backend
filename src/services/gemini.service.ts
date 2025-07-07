import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIGeneratedContent, EnhancedMetadata } from "../types";
import dotenv from "dotenv";

dotenv.config();

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private apiKey: string;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 8000; // 7 seconds between requests

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      console.warn("⚠️ GEMINI_API_KEY not found in environment variables");
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });
  }

  /**
   * Wait for minimum interval between requests
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Retry function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 8000
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error: any) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Check if it's a rate limit error
        if (error.status === 429 || error.message?.includes("429")) {
          const delay = baseDelay;
          console.warn(
            `⚠️ Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${
              maxRetries + 1
            })`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // For other errors, don't retry
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
  }

  /**
   * Generate a summary for a specific path
   */
  async generatePathSummary(path: string, content: string): Promise<string> {
    if (!this.apiKey) {
      return "Summary not available (AI service not configured)";
    }

    try {
      const prompt = `Generate a concise 1-2 sentence summary for this webpage content. Focus on the main purpose and key information.

Path: ${path}
Content: ${content.substring(0, 2000)}...

Summary:`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      });
    } catch (error) {
      console.error("Error generating path summary:", error);
      return "Summary generation failed";
    }
  }

  /**
   * Generate context snippet for a path
   */
  async generateContextSnippet(path: string, content: string): Promise<string> {
    if (!this.apiKey) {
      return "Context snippet not available (AI service not configured)";
    }

    try {
      const prompt = `Generate a brief context snippet (2-3 sentences) that describes what this page is about and its key value proposition.

Path: ${path}
Content: ${content.substring(0, 2000)}...

Context Snippet:`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      });
    } catch (error) {
      console.error("Error generating context snippet:", error);
      return "Context snippet generation failed";
    }
  }

  /**
   * Extract keywords from content
   */
  async extractKeywords(content: string): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const prompt = `Extract 5-10 relevant keywords from this content. Return only the keywords as a comma-separated list.

Content: ${content.substring(0, 2000)}...

Keywords:`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const keywords = response
          .text()
          .trim()
          .split(",")
          .map((k: string) => k.trim());
        return keywords.filter((k: string) => k.length > 0);
      });
    } catch (error) {
      console.error("Error extracting keywords:", error);
      return [];
    }
  }

  /**
   * Determine content type
   */
  async determineContentType(path: string, content: string): Promise<string> {
    if (!this.apiKey) {
      return "page";
    }

    try {
      const prompt = `Based on the path and content, determine the content type. Choose from: page, blog, docs, project, archive, terms.

Path: ${path}
Content: ${content.substring(0, 1000)}...

Content Type:`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const contentType = response.text().trim().toLowerCase();

        // Validate against allowed types
        const allowedTypes = [
          "page",
          "blog",
          "docs",
          "project",
          "archive",
          "terms",
        ];
        return allowedTypes.includes(contentType) ? contentType : "page";
      });
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
    if (!this.apiKey) {
      return "medium";
    }

    try {
      const prompt = `Based on the path and content, determine the priority level for AI crawling. Consider factors like:
- High: Main pages, important content, frequently accessed
- Medium: Regular content pages
- Low: Archive, terms, less important pages

Path: ${path}
Content: ${content.substring(0, 1000)}...

Priority (high/medium/low):`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const priority = response.text().trim().toLowerCase();

        if (
          priority === "high" ||
          priority === "medium" ||
          priority === "low"
        ) {
          return priority;
        }
        return "medium";
      });
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
    if (!this.apiKey) {
      return "allow";
    }

    try {
      const prompt = `Based on the path and content, suggest an AI usage directive:
- allow: Standard content that can be freely used
- citation-only: Content that should only be used for citations
- no-fine-tuning: Content that can be used but not for training
- disallow: Content that should not be used by AI

Path: ${path}
Content: ${content.substring(0, 1000)}...

Directive:`;

      return await this.retryWithBackoff(async () => {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const directive = response.text().trim().toLowerCase();

        const allowedDirectives = [
          "allow",
          "citation-only",
          "no-fine-tuning",
          "disallow",
        ];
        return allowedDirectives.includes(directive)
          ? (directive as any)
          : "allow";
      });
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
        model: "gemini-2.0-flash-exp",
      };
    } catch (error) {
      console.error("Error generating AI content:", error);
      // Return fallback content instead of throwing
      return {
        path,
        summary: "AI analysis failed",
        contextSnippet: "Context analysis failed",
        keywords: [],
        contentType: "page",
        priority: "medium",
        aiUsageDirective: "allow",
        generatedAt: new Date().toISOString(),
        model: "gemini-2.0-flash-exp",
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
    if (!this.apiKey) {
      return [];
    }

    try {
      const prompt = `Group these website paths into logical hierarchical sections. For each group, provide a name and description.

Paths: ${paths.join("\n")}

Return as JSON array with format:
[
  {
    "group": "Main Pages",
    "paths": ["/", "/about", "/contact"],
    "description": "Primary navigation pages"
  }
]`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const jsonMatch = response.text().match(/\[[\s\S]*\]/);

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

export const geminiService = new GeminiService();
