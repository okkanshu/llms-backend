import FirecrawlApp from "@mendable/firecrawl-js";
import { MarkdownGenerationResponse } from "../types";
import { openRouterService } from "./gemini.service";
import dotenv from "dotenv";

dotenv.config();

interface MarkdownPage {
  path: string;
  title: string;
  content: string;
  metadata?: {
    description?: string;
    keywords?: string[];
    lastModified?: string;
  };
}

export class MarkdownGeneratorService {
  private apiKey: string;
  private app: FirecrawlApp;

  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY || "";
    this.app = new FirecrawlApp({
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate markdown versions of key pages
   */
  async generateMarkdownPages(
    websiteUrl: string
  ): Promise<MarkdownGenerationResponse> {
    try {
      console.log(`📝 Starting markdown generation for: ${websiteUrl}`);

      // Extract key pages
      const keyPages = await this.extractKeyPages(websiteUrl);

      // Generate markdown files
      const files = await this.generateMarkdownFiles(keyPages, websiteUrl);

      console.log(`✅ Markdown generation completed:`, {
        totalFiles: files.length,
        websiteUrl,
      });

      return {
        success: true,
        files,
      };
    } catch (error) {
      console.error("❌ Markdown generation failed:", error);
      return {
        success: false,
        files: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract key pages from the website
   */
  private async extractKeyPages(websiteUrl: string): Promise<MarkdownPage[]> {
    console.log(`🔍 Extracting key pages from: ${websiteUrl}`);

    const crawlResult = await this.app.crawlUrl(websiteUrl, {
      limit: 50,
      maxDepth: 2,
      scrapeOptions: {
        formats: ["markdown", "html"],
      },
    });

    if (!crawlResult.success || !crawlResult.data) {
      throw new Error("Failed to crawl website for markdown generation");
    }

    const keyPages: MarkdownPage[] = [];
    const priorityPaths = this.getPriorityPaths();

    for (const page of crawlResult.data) {
      const pageUrl = page.metadata?.sourceURL || page.metadata?.url;
      if (!pageUrl) continue;

      const path = new URL(pageUrl).pathname;

      // Check if this is a priority path or should be included
      if (this.shouldIncludePage(path, priorityPaths)) {
        try {
          const markdownPage = await this.extractMarkdownPage(pageUrl, page);
          keyPages.push(markdownPage);
        } catch (error) {
          console.warn(`⚠️ Failed to extract markdown from ${pageUrl}:`, error);
        }
      }
    }

    return keyPages;
  }

  /**
   * Get priority paths that should always be included
   */
  private getPriorityPaths(): string[] {
    return [
      "/",
      "/about",
      "/about/",
      "/contact",
      "/contact/",
      "/projects",
      "/projects/",
      "/blog",
      "/blog/",
      "/docs",
      "/docs/",
      "/services",
      "/services/",
      "/products",
      "/products/",
      "/team",
      "/team/",
      "/careers",
      "/careers/",
      "/privacy",
      "/privacy/",
      "/terms",
      "/terms/",
    ];
  }

  /**
   * Determine if a page should be included in markdown generation
   */
  private shouldIncludePage(path: string, priorityPaths: string[]): boolean {
    // Always include priority paths
    if (priorityPaths.includes(path)) {
      return true;
    }

    // Include paths that look like main content pages
    const pathSegments = path.split("/").filter(Boolean);

    // Skip if too deep (more than 2 levels)
    if (pathSegments.length > 2) {
      return false;
    }

    // Skip common non-content paths
    const skipPatterns = [
      /^\/api\//,
      /^\/admin\//,
      /^\/login/,
      /^\/register/,
      /^\/dashboard/,
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip)$/,
    ];

    for (const pattern of skipPatterns) {
      if (pattern.test(path)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract markdown content from a single page
   */
  private async extractMarkdownPage(
    url: string,
    page: any
  ): Promise<MarkdownPage> {
    const path = new URL(url).pathname;
    const title = page.metadata?.title || page.title || path;

    // Get markdown content
    let content = page.markdown || "";

    // If no markdown, convert HTML to markdown
    if (!content && page.html) {
      content = this.htmlToMarkdown(page.html);
    }

    // Extract metadata
    const metadata = {
      description: page.metadata?.description,
      keywords: page.metadata?.keywords
        ? page.metadata.keywords.split(",").map((k: string) => k.trim())
        : undefined,
      lastModified: page.metadata?.lastModified,
    };

    return {
      path,
      title,
      content,
      metadata,
    };
  }

  /**
   * Simple HTML to Markdown conversion
   */
  private htmlToMarkdown(html: string): string {
    let markdown = html
      // Remove script and style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

      // Convert headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n")
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n")

      // Convert paragraphs
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")

      // Convert links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")

      // Convert bold and italic
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")

      // Convert lists
      .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
        return content.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n") + "\n";
      })
      .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
        let counter = 1;
        return (
          content.replace(
            /<li[^>]*>(.*?)<\/li>/gi,
            () => `${counter++}. $1\n`
          ) + "\n"
        );
      })

      // Remove remaining HTML tags
      .replace(/<[^>]*>/g, "")

      // Decode HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    return markdown.trim();
  }

  /**
   * Generate markdown files for all key pages
   */
  private async generateMarkdownFiles(
    pages: MarkdownPage[],
    websiteUrl: string
  ): Promise<
    Array<{
      path: string;
      content: string;
      filename: string;
    }>
  > {
    const files: Array<{
      path: string;
      content: string;
      filename: string;
    }> = [];

    for (const page of pages) {
      try {
        const markdownContent = await this.generateSingleMarkdownFile(
          page,
          websiteUrl
        );
        const filename = this.generateFilename(page.path);

        files.push({
          path: page.path,
          content: markdownContent,
          filename,
        });
      } catch (error) {
        console.warn(`⚠️ Failed to generate markdown for ${page.path}:`, error);
      }
    }

    return files;
  }

  /**
   * Generate markdown content for a single page
   */
  private async generateSingleMarkdownFile(
    page: MarkdownPage,
    websiteUrl: string
  ): Promise<string> {
    let content = `# ${page.title}\n\n`;

    // Add metadata
    content += `**Source:** ${websiteUrl}${page.path}\n`;
    content += `**Generated:** ${new Date().toISOString()}\n`;

    if (page.metadata?.lastModified) {
      content += `**Last Modified:** ${page.metadata.lastModified}\n`;
    }

    if (page.metadata?.description) {
      content += `**Description:** ${page.metadata.description}\n`;
    }

    if (page.metadata?.keywords && page.metadata.keywords.length > 0) {
      content += `**Keywords:** ${page.metadata.keywords.join(", ")}\n`;
    }

    // Add AI-generated summary if available or generate if missing
    let summary = (page as any).summary;
    if (!summary) {
      try {
        const aiContent = await openRouterService.generateAIContent(
          page.path,
          page.content
        );
        summary = aiContent.summary;
      } catch {}
    }
    if (
      summary &&
      !summary.includes("not available") &&
      !summary.includes("failed")
    ) {
      content += `**Summary:** ${summary}\n`;
    }

    content += `\n---\n\n`;

    // Add main content
    content += `## Content\n\n${page.content}\n`;

    return content;
  }

  /**
   * Generate filename for a markdown file
   */
  private generateFilename(path: string): string {
    // Clean the path for filename
    let filename = path
      .replace(/^\//, "") // Remove leading slash
      .replace(/\/$/, "") // Remove trailing slash
      .replace(/\//g, "-") // Replace slashes with hyphens
      .replace(/[^a-zA-Z0-9\-_]/g, "") // Remove special characters
      .toLowerCase();

    // Handle empty filename (root path)
    if (!filename) {
      filename = "index";
    }

    return `${filename}.md`;
  }

  /**
   * Generate a sitemap in markdown format
   */
  async generateMarkdownSitemap(websiteUrl: string): Promise<string> {
    try {
      const pages = await this.extractKeyPages(websiteUrl);

      let content = `# Site Map\n\n`;
      content += `**Website:** ${websiteUrl}\n`;
      content += `**Generated:** ${new Date().toISOString()}\n`;
      content += `**Total Pages:** ${pages.length}\n\n`;

      // Group pages by section
      const sections = this.groupPagesBySection(pages);

      Object.entries(sections).forEach(([section, sectionPages]) => {
        content += `## ${section}\n\n`;
        sectionPages.forEach((page) => {
          content += `- [${page.title}](${page.path})\n`;
          if (page.metadata?.description) {
            content += `  - ${page.metadata.description}\n`;
          }
        });
        content += `\n`;
      });

      return content;
    } catch (error) {
      console.error("❌ Markdown sitemap generation failed:", error);
      return `# Site Map\nError generating sitemap: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  /**
   * Group pages by logical sections
   */
  private groupPagesBySection(
    pages: MarkdownPage[]
  ): Record<string, MarkdownPage[]> {
    const sections: Record<string, MarkdownPage[]> = {
      "Main Pages": [],
      "About & Contact": [],
      Content: [],
      Legal: [],
      Other: [],
    };

    pages.forEach((page) => {
      const path = page.path.toLowerCase();

      if (path === "/" || path === "/home") {
        sections["Main Pages"].push(page);
      } else if (
        path.includes("about") ||
        path.includes("contact") ||
        path.includes("team")
      ) {
        sections["About & Contact"].push(page);
      } else if (
        path.includes("blog") ||
        path.includes("docs") ||
        path.includes("projects") ||
        path.includes("services") ||
        path.includes("products")
      ) {
        sections["Content"].push(page);
      } else if (
        path.includes("privacy") ||
        path.includes("terms") ||
        path.includes("legal")
      ) {
        sections["Legal"].push(page);
      } else {
        sections["Other"].push(page);
      }
    });

    // Remove empty sections
    Object.keys(sections).forEach((section) => {
      if (sections[section].length === 0) {
        delete sections[section];
      }
    });

    return sections;
  }
}

export const markdownGeneratorService = new MarkdownGeneratorService();
