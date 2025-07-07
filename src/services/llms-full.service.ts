import FirecrawlApp from "@mendable/firecrawl-js";
import { LLMsFullPayload, LLMsFullGenerationResponse } from "../types";
import { geminiService } from "./gemini.service";
import dotenv from "dotenv";

dotenv.config();

interface FullPageData {
  url: string;
  path: string;
  title: string;
  content: string;
  links: string[];
  images?: string[];
  lastModified?: string;
  description?: string;
  keywords?: string[];
  aiEnriched?: boolean;
}

export class LLMsFullService {
  private apiKey: string;
  private app: FirecrawlApp;

  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY || "";
    this.app = new FirecrawlApp({
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate comprehensive llms-full.txt content
   */
  async generateLLMsFull(
    payload: LLMsFullPayload
  ): Promise<LLMsFullGenerationResponse> {
    try {
      console.log(
        `🔍 Starting llms-full.txt generation for: ${payload.websiteUrl}`
      );

      const {
        websiteUrl,
        includeImages = false,
        includeLinks = true,
        maxDepth = 3,
        aiEnrichment = false,
      } = payload;

      // Extract all pages and content
      const pagesData = await this.extractAllPages(websiteUrl, maxDepth);

      // Generate the full markdown content
      const content = await this.generateFullContent(pagesData, {
        includeImages,
        includeLinks,
        aiEnrichment,
      });

      const totalWords = content.split(/\s+/).length;
      const filename = `llms-full-${new Date().toISOString().slice(0, 10)}.txt`;

      console.log(`✅ llms-full.txt generation completed:`, {
        totalPages: pagesData.length,
        totalWords,
        filename,
        aiEnrichment,
      });

      return {
        success: true,
        content,
        filename,
        totalPages: pagesData.length,
        totalWords,
      };
    } catch (error) {
      console.error("❌ llms-full.txt generation failed:", error);
      return {
        success: false,
        content: "",
        filename: "",
        totalPages: 0,
        totalWords: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract all pages from the website
   */
  private async extractAllPages(
    url: string,
    maxDepth: number
  ): Promise<FullPageData[]> {
    console.log(`🕷️ Crawling website with max depth: ${maxDepth}`);

    const crawlResult = await this.app.crawlUrl(url, {
      limit: 100,
      maxDepth,
      scrapeOptions: {
        formats: ["markdown", "html"],
      },
    });

    if (!crawlResult.success || !crawlResult.data) {
      throw new Error("Failed to crawl website");
    }

    const pagesData: FullPageData[] = [];

    for (const page of crawlResult.data) {
      const pageUrl = page.metadata?.sourceURL || page.metadata?.url;
      if (!pageUrl) continue;

      try {
        const pageData = await this.extractPageData(pageUrl, page);
        pagesData.push(pageData);
      } catch (error) {
        console.warn(`⚠️ Failed to extract data from ${pageUrl}:`, error);
      }
    }

    return pagesData;
  }

  /**
   * Extract data from a single page
   */
  private async extractPageData(url: string, page: any): Promise<FullPageData> {
    const path = new URL(url).pathname;

    // Extract content from the page
    const content = page.markdown || page.html || "";

    // Extract links
    const links: string[] = [];
    if (page.links && Array.isArray(page.links)) {
      links.push(...page.links);
    }

    // Extract images
    const images: string[] = [];
    if (page.images && Array.isArray(page.images)) {
      images.push(...page.images);
    }

    // Extract title
    const title = page.metadata?.title || page.title || path;

    // Extract description and keywords
    const description: string | undefined = page.metadata?.description;
    const keywords: string[] | undefined = page.metadata?.keywords
      ? page.metadata.keywords.split(",").map((k: string) => k.trim())
      : undefined;

    return {
      url,
      path,
      title,
      content,
      links,
      images,
      lastModified: page.metadata?.lastModified || new Date().toISOString(),
      description,
      keywords,
    };
  }

  /**
   * Generate the full markdown content
   */
  private async generateFullContent(
    pagesData: FullPageData[],
    options: {
      includeImages: boolean;
      includeLinks: boolean;
      aiEnrichment: boolean;
    }
  ): Promise<string> {
    let content = `# LLMs Full Site Content\n`;
    content += `# Generated: ${new Date().toISOString()}\n`;
    content += `# Total Pages: ${pagesData.length}\n`;
    content += `# AI Enrichment: ${
      options.aiEnrichment ? "Enabled" : "Disabled"
    }\n\n`;

    content += `## Table of Contents\n`;
    pagesData.forEach((page, index) => {
      content += `${index + 1}. [${page.title}](${page.path})\n`;
    });
    content += `\n`;

    // Generate content for each page
    for (const page of pagesData) {
      content += await this.generatePageContent(page, options);
      content += `\n---\n\n`;
    }

    return content;
  }

  /**
   * Generate content for a single page
   */
  private async generatePageContent(
    page: FullPageData,
    options: {
      includeImages: boolean;
      includeLinks: boolean;
      aiEnrichment: boolean;
    }
  ): Promise<string> {
    let content = `# ${page.title}\n`;
    content += `**Path:** ${page.path}\n`;
    content += `**URL:** ${page.url}\n`;
    if (page.lastModified) {
      content += `**Last Modified:** ${page.lastModified}\n`;
    }
    if (page.description) content += `**Description:** ${page.description}\n`;
    if (page.keywords && page.keywords.length > 0)
      content += `**Keywords:** ${page.keywords.join(", ")}\n`;
    // Add AI summary
    let summary = (page as any).summary;
    if (options.aiEnrichment && !summary) {
      try {
        const aiContent = await geminiService.generateAIContent(
          page.path,
          page.content
        );
        summary = aiContent.summary;
      } catch {}
    }
    if (summary) content += `**Summary:** ${summary}\n`;
    content += `\n`;

    // Add AI enrichment if enabled
    if (options.aiEnrichment) {
      try {
        const aiContent = await geminiService.generateAIContent(
          page.path,
          page.content
        );

        content += `## AI Analysis\n`;
        if (aiContent.summary) {
          content += `**Summary:** ${aiContent.summary}\n\n`;
        }
        if (aiContent.contextSnippet) {
          content += `**Context:** ${aiContent.contextSnippet}\n\n`;
        }
        if (aiContent.keywords && aiContent.keywords.length > 0) {
          content += `**Keywords:** ${aiContent.keywords.join(", ")}\n\n`;
        }
        content += `**Content Type:** ${aiContent.contentType}\n`;
        content += `**Priority:** ${aiContent.priority}\n`;
        content += `**AI Usage Directive:** ${aiContent.aiUsageDirective}\n`;
        content += `**Generated At:** ${aiContent.generatedAt}\n`;
        content += `**Model:** ${aiContent.model}\n\n`;
      } catch (error) {
        console.warn(`⚠️ AI enrichment failed for ${page.path}:`, error);
      }
    }

    // Add main content
    content += `## Content\n\n`;
    content += page.content;
    content += `\n\n`;

    // Add links if requested
    if (options.includeLinks && page.links.length > 0) {
      content += `## Links\n\n`;
      page.links.forEach((link) => {
        content += `- ${link}\n`;
      });
      content += `\n`;
    }

    // Add images if requested
    if (options.includeImages && page.images && page.images.length > 0) {
      content += `## Images\n\n`;
      page.images.forEach((image) => {
        content += `- ${image}\n`;
      });
      content += `\n`;
    }

    return content;
  }

  /**
   * Generate a sitemap-style overview
   */
  async generateSitemapOverview(url: string): Promise<string> {
    try {
      const pagesData = await this.extractAllPages(url, 2);

      let content = `# Site Overview\n`;
      content += `**Website:** ${url}\n`;
      content += `**Generated:** ${new Date().toISOString()}\n`;
      content += `**Total Pages:** ${pagesData.length}\n\n`;

      content += `## Page Structure\n\n`;

      // Group pages by depth
      const pagesByDepth = this.groupPagesByDepth(pagesData);

      Object.entries(pagesByDepth).forEach(([depth, pages]) => {
        content += `### Depth ${depth}\n`;
        pages.forEach((page) => {
          content += `- ${page.title} (${page.path})\n`;
        });
        content += `\n`;
      });

      return content;
    } catch (error) {
      console.error("❌ Sitemap overview generation failed:", error);
      return `# Site Overview\nError generating overview: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  /**
   * Group pages by their depth in the site structure
   */
  private groupPagesByDepth(
    pages: FullPageData[]
  ): Record<string, FullPageData[]> {
    const grouped: Record<string, FullPageData[]> = {};

    pages.forEach((page) => {
      const depth = page.path.split("/").filter(Boolean).length;
      const depthKey = depth.toString();

      if (!grouped[depthKey]) {
        grouped[depthKey] = [];
      }
      grouped[depthKey].push(page);
    });

    return grouped;
  }
}

export const llmsFullService = new LLMsFullService();
