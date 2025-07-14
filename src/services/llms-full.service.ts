import { LLMsFullPayload, LLMsFullGenerationResponse } from "../types";
import { xaiService } from "./ai.service";
import { webCrawlerService } from "./web-crawler.service";
import { chromium, Browser, Page } from "playwright";
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
  private rateLimiter = {
    lastRequestTime: 0,
    requestsPerSecond: 25,
    minInterval: 1000 / 25, // 40ms between requests
  };

  private playwrightRateLimiter = {
    lastRequestTime: 0,
    requestsPerMinute: 25, // 20-30 per minute
    minInterval: 60000 / 25, // 2.4 seconds minimum
    maxConcurrentTabs: 2, // 1-3 concurrent tabs
    activeTabs: 0,
  };

  private browser: Browser | null = null;
  private page: Page | null = null;
  private userAgent = "TheLLMsTxt-Crawler/1.0";

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

    try {
      // Use the web crawler service directly to get the crawled data
      const baseUrl = new URL(url).origin;
      const discovered = new Set<string>();
      const crawled = new Map<string, any>();
      const toCrawl: [string, number][] = [[url, 0]];
      let pages = 0;
      const maxPages = 1000;

      console.log(`🕷️ Starting direct crawl for ${url}`);

      while (toCrawl.length && pages < maxPages) {
        const [cur, depth] = toCrawl.shift()!;
        if (discovered.has(cur) || depth > maxDepth) continue;
        discovered.add(cur);
        pages++;

        console.log(
          `📄 Crawling page ${pages}/${maxPages}: ${cur} (depth: ${depth})`
        );

        try {
          // Rate limiting for cheerio requests
          await this.enforceRateLimit();

          // Use the web crawler's crawlPage method directly
          const baseDomain = new URL(baseUrl).hostname;
          const res = await webCrawlerService.crawlPage(cur, baseDomain);
          crawled.set(cur, res);

          if (res.success) {
            console.log(`✅ Successfully crawled: ${res.path}`);
            console.log(`   Title: "${res.metadata.title}"`);
            console.log(
              `   Body content length: ${
                res.metadata.bodyContent?.length || 0
              } chars`
            );

            // Add discovered links to crawl queue
            if (res.metadata.links) {
              for (const link of res.metadata.links) {
                try {
                  const abs = new URL(link, baseUrl).href;
                  if (
                    new URL(abs).hostname === baseDomain &&
                    !discovered.has(abs)
                  ) {
                    toCrawl.push([abs, depth + 1]);
                  }
                } catch {}
              }
            }
          } else {
            console.log(`❌ Failed to crawl: ${cur} - ${res.error}`);
          }
        } catch (error) {
          console.log(`❌ Error crawling ${cur}:`, error);
        }

        await new Promise((r) => setTimeout(r, 500));
      }

      // Convert crawled data to FullPageData format
      const pagesData: FullPageData[] = [];

      console.log(`📋 Processing ${crawled.size} crawled pages`);

      for (const [url, crawlResult] of crawled.entries()) {
        if (crawlResult.success) {
          const bodyContent = crawlResult.metadata.bodyContent || "";

          console.log(`📄 Processing page: ${crawlResult.path}`);
          console.log(`   Title: "${crawlResult.metadata.title}"`);
          console.log(`   Body content length: ${bodyContent.length} chars`);
          console.log(`   Body preview: "${bodyContent.substring(0, 100)}..."`);

          const pageData: FullPageData = {
            url: url,
            path: crawlResult.path,
            title: crawlResult.metadata.title || "Untitled",
            content: bodyContent,
            links: crawlResult.metadata.links || [],
            description: crawlResult.metadata.description || "",
            keywords: crawlResult.metadata.keywords
              ? crawlResult.metadata.keywords
                  .split(",")
                  .map((k: string) => k.trim())
              : [],
            lastModified: new Date().toISOString(),
          };
          pagesData.push(pageData);
        }
      }

      console.log(
        `📋 Successfully extracted ${pagesData.length} pages with body content`
      );
      return pagesData;
    } catch (error) {
      console.error("❌ Failed to extract pages:", error);
      throw new Error("Failed to crawl website");
    }
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
        const aiContent = await xaiService.generateAIContent(
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
        const aiContent = await xaiService.generateAIContent(
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
   * Rate limiting enforcement
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimiter.minInterval) {
      const delay = this.rateLimiter.minInterval - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting: waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.rateLimiter.lastRequestTime = Date.now();
  }

  /**
   * Playwright rate limiting enforcement
   */
  private async enforcePlaywrightRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest =
      now - this.playwrightRateLimiter.lastRequestTime;

    if (timeSinceLastRequest < this.playwrightRateLimiter.minInterval) {
      const delay =
        this.playwrightRateLimiter.minInterval - timeSinceLastRequest;
      console.log(`⏱️ Playwright rate limiting: waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Add random delay between 2-6 seconds
    const randomDelay = Math.floor(Math.random() * 4000) + 2000; // 2-6 seconds
    console.log(`⏱️ Playwright random delay: ${randomDelay}ms`);
    await new Promise((resolve) => setTimeout(resolve, randomDelay));

    this.playwrightRateLimiter.lastRequestTime = Date.now();
  }

  /**
   * Initialize Playwright browser singleton
   */
  private async getPlaywrightBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log(`🚀 Initializing Playwright browser...`);
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    return this.browser;
  }

  /**
   * Get or create Playwright page
   */
  private async getPlaywrightPage(): Promise<Page> {
    // Check concurrent tabs limit
    if (
      this.playwrightRateLimiter.activeTabs >=
      this.playwrightRateLimiter.maxConcurrentTabs
    ) {
      console.log(
        `⏱️ Playwright rate limiting: waiting for available tab slot`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.getPlaywrightPage(); // Retry
    }

    this.playwrightRateLimiter.activeTabs++;

    if (!this.page) {
      const browser = await this.getPlaywrightBrowser();
      this.page = await browser.newPage();
      await this.page.setExtraHTTPHeaders({ "User-Agent": this.userAgent });
      await this.page.setViewportSize({ width: 1280, height: 720 });
    }
    return this.page;
  }

  /**
   * Scrape page with Playwright for dynamic content
   */
  private async scrapeWithPlaywright(url: string): Promise<{
    title: string;
    description: string;
    keywords: string;
    bodySnippet: string;
  }> {
    // Rate limiting for playwright requests
    await this.enforcePlaywrightRateLimit();

    const page = await this.getPlaywrightPage();

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 10000,
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Extract metadata using the same logic as Cheerio
      const title = await page.evaluate(() => {
        const titleEl = document.querySelector("title");
        const h1El = document.querySelector("h1");
        const ogTitleEl = document.querySelector('meta[property="og:title"]');

        return (
          titleEl?.textContent?.trim() ||
          h1El?.textContent?.trim() ||
          ogTitleEl?.getAttribute("content") ||
          ""
        );
      });

      const description = await page.evaluate(() => {
        const descEl = document.querySelector('meta[name="description"]');
        const ogDescEl = document.querySelector(
          'meta[property="og:description"]'
        );
        const firstP = document.querySelector("p");

        return (
          descEl?.getAttribute("content") ||
          ogDescEl?.getAttribute("content") ||
          firstP?.textContent?.trim().substring(0, 160) ||
          ""
        );
      });

      const keywords = await page.evaluate(() => {
        const keywordsEl = document.querySelector('meta[name="keywords"]');
        return keywordsEl?.getAttribute("content") || "";
      });

      // Extract body content
      const bodySnippet = await page.evaluate(() => {
        // Remove script, style, noscript, iframe, svg elements
        const elementsToRemove = document.querySelectorAll(
          "script, style, noscript, iframe, svg"
        );
        elementsToRemove.forEach((el) => el.remove());

        const bodyText = document.body?.textContent || "";
        const cleanedText = bodyText
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        return cleanedText.slice(0, 30000);
      });

      return { title, description, keywords, bodySnippet };
    } catch (error) {
      console.log(`❌ Playwright scraping failed: ${error}`);
      return {
        title: "",
        description: "",
        keywords: "",
        bodySnippet: "",
      };
    } finally {
      // Release tab slot
      this.playwrightRateLimiter.activeTabs = Math.max(
        0,
        this.playwrightRateLimiter.activeTabs - 1
      );
    }
  }

  /**
   * Enhanced scraping with Playwright fallback
   */
  async scrapePage(url: string): Promise<{
    title: string;
    description: string;
    keywords: string;
    bodySnippet: string;
  }> {
    console.log(`🌐 Starting enhanced scraping for: ${url}`);

    try {
      // First attempt: Use web crawler service (fast path)
      console.log(`⚡ Attempting web crawler service...`);
      const baseDomain = new URL(url).hostname;
      const cheerioResult = await webCrawlerService.crawlPage(url, baseDomain);

      if (cheerioResult.success) {
        const result = {
          title: cheerioResult.metadata.title || "",
          description: cheerioResult.metadata.description || "",
          keywords: cheerioResult.metadata.keywords || "",
          bodySnippet: cheerioResult.metadata.bodyContent || "",
        };

        // Check if content is sufficient
        const isContentSufficient = this.isContentSufficient(result);

        if (isContentSufficient) {
          console.log(`✅ Web crawler service successful - content sufficient`);
          return result;
        }
      }

      // Fallback to Playwright
      console.log(
        `⚠️ [warning] Falling back to Playwright: heavy page detected`
      );
      console.log(`🎭 Attempting Playwright scraping...`);

      const playwrightResult = await this.scrapeWithPlaywright(url);
      console.log(`✅ Playwright scraping completed`);

      return playwrightResult;
    } catch (error) {
      console.log(`❌ Enhanced scraping failed: ${error}`);
      return {
        title: "",
        description: "",
        keywords: "",
        bodySnippet: "",
      };
    }
  }

  /**
   * Check if content is sufficient (detection logic)
   */
  private isContentSufficient(result: {
    title: string;
    description: string;
    keywords: string;
    bodySnippet: string;
  }): boolean {
    const hasTitle = result.title.length > 0;
    const hasDescription = result.description.length > 0;
    const hasBodyContent = result.bodySnippet.length >= 1000;

    // Fallback to Playwright if all are empty or body content is too short
    const needsFallback = !hasTitle && !hasDescription && !hasBodyContent;

    console.log(`🔍 Content sufficiency check:`);
    console.log(
      `   Title: ${hasTitle ? "✅" : "❌"} (${result.title.length} chars)`
    );
    console.log(
      `   Description: ${hasDescription ? "✅" : "❌"} (${
        result.description.length
      } chars)`
    );
    console.log(
      `   Body content: ${hasBodyContent ? "✅" : "❌"} (${
        result.bodySnippet.length
      } chars)`
    );
    console.log(`   Needs fallback: ${needsFallback ? "Yes" : "No"}`);

    return !needsFallback;
  }

  /**
   * Cleanup Playwright resources
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
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
