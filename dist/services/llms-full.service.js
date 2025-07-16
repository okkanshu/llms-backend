"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmsFullService = exports.LLMsFullService = void 0;
exports.estimateCrawlTime = estimateCrawlTime;
const ai_service_1 = require("./ai.service");
const web_crawler_service_1 = require("./web-crawler.service");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class LLMsFullService {
    constructor() {
        this.rateLimiter = {
            lastRequestTime: 0,
            requestsPerSecond: 25,
            minInterval: 1000 / 25,
        };
    }
    async generateLLMsFull(payload) {
        try {
            console.log(`🔍 Starting llms-full.txt generation for: ${payload.websiteUrl}`);
            const { websiteUrl, includeImages = false, includeLinks = true, maxDepth = 3, aiEnrichment = false, } = payload;
            const pagesData = await this.extractAllPages(websiteUrl, maxDepth);
            const content = await this.generateFullContent(pagesData, {
                includeImages,
                includeLinks,
                aiEnrichment,
            });
            const totalWords = content.split(/\s+/).length;
            const filename = `llms-full.txt`;
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
        }
        catch (error) {
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
    async extractAllPages(url, maxDepth) {
        console.log(`🕷️ Crawling website with max depth: ${maxDepth}`);
        try {
            const baseUrl = new URL(url).origin;
            const discovered = new Set();
            const crawled = new Map();
            const toCrawl = [[url, 0]];
            let pages = 0;
            const maxPages = 1000;
            console.log(`🕷️ Starting direct crawl for ${url}`);
            while (toCrawl.length && pages < maxPages) {
                const [cur, depth] = toCrawl.shift();
                if (discovered.has(cur) || depth > maxDepth)
                    continue;
                discovered.add(cur);
                pages++;
                console.log(`📄 Crawling page ${pages}/${maxPages}: ${cur} (depth: ${depth})`);
                try {
                    await this.enforceRateLimit();
                    const baseDomain = new URL(baseUrl).hostname;
                    const res = await web_crawler_service_1.webCrawlerService.crawlPage(cur, baseDomain);
                    crawled.set(cur, res);
                    if (res.success) {
                        console.log(`✅ Successfully crawled: ${res.path}`);
                        console.log(`   Title: "${res.metadata.title}"`);
                        console.log(`   Body content length: ${res.metadata.bodyContent?.length || 0} chars`);
                        if (res.metadata.links) {
                            for (const link of res.metadata.links) {
                                try {
                                    const abs = new URL(link, baseUrl).href;
                                    if (new URL(abs).hostname === baseDomain &&
                                        !discovered.has(abs)) {
                                        toCrawl.push([abs, depth + 1]);
                                    }
                                }
                                catch { }
                            }
                        }
                    }
                    else {
                        console.log(`❌ Failed to crawl: ${cur} - ${res.error}`);
                    }
                }
                catch (error) {
                    console.log(`❌ Error crawling ${cur}:`, error);
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            const pagesData = [];
            console.log(`📋 Processing ${crawled.size} crawled pages`);
            for (const [url, crawlResult] of crawled.entries()) {
                if (crawlResult.success) {
                    const bodyContent = crawlResult.metadata.bodyContent || "";
                    console.log(`📄 Processing page: ${crawlResult.path}`);
                    console.log(`   Title: "${crawlResult.metadata.title}"`);
                    console.log(`   Body content length: ${bodyContent.length} chars`);
                    console.log(`   Body preview: "${bodyContent.substring(0, 100)}..."`);
                    const pageData = {
                        url: url,
                        path: crawlResult.path,
                        title: crawlResult.metadata.title || "Untitled",
                        content: bodyContent,
                        links: crawlResult.metadata.links || [],
                        description: crawlResult.metadata.description || "",
                        keywords: crawlResult.metadata.keywords
                            ? crawlResult.metadata.keywords
                                .split(",")
                                .map((k) => k.trim())
                            : [],
                        lastModified: new Date().toISOString(),
                    };
                    pagesData.push(pageData);
                }
            }
            console.log(`📋 Successfully extracted ${pagesData.length} pages with body content`);
            return pagesData;
        }
        catch (error) {
            console.error("❌ Failed to extract pages:", error);
            throw new Error("Failed to crawl website");
        }
    }
    async extractPageData(url, page) {
        const path = new URL(url).pathname;
        const content = page.markdown || page.html || "";
        const links = [];
        if (page.links && Array.isArray(page.links)) {
            links.push(...page.links);
        }
        const images = [];
        if (page.images && Array.isArray(page.images)) {
            images.push(...page.images);
        }
        const title = page.metadata?.title || page.title || path;
        const description = page.metadata?.description;
        const keywords = page.metadata?.keywords
            ? page.metadata.keywords.split(",").map((k) => k.trim())
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
    async generateFullContent(pagesData, options) {
        let content = `# LLMs Full Site Content\n`;
        content += `# Generated: ${new Date().toISOString()}\n`;
        content += `# Total Pages: ${pagesData.length}\n`;
        content += `# AI Enrichment: ${options.aiEnrichment ? "Enabled" : "Disabled"}\n\n`;
        content += `## Table of Contents\n`;
        pagesData.forEach((page, index) => {
            content += `${index + 1}. [${page.title}](${page.path})\n`;
        });
        content += `\n`;
        for (const page of pagesData) {
            content += await this.generatePageContent(page, options);
            content += `\n---\n\n`;
        }
        return content;
    }
    async generatePageContent(page, options) {
        let content = `# ${page.title}\n`;
        content += `**Path:** ${page.path}\n`;
        content += `**URL:** ${page.url}\n`;
        if (page.lastModified) {
            content += `**Last Modified:** ${page.lastModified}\n`;
        }
        if (page.description)
            content += `**Description:** ${page.description}\n`;
        if (page.keywords && page.keywords.length > 0)
            content += `**Keywords:** ${page.keywords.join(", ")}\n`;
        let summary = page.summary;
        if (options.aiEnrichment && !summary) {
            try {
                const aiContent = await ai_service_1.xaiService.generateAIContent(page.path, page.content);
                summary = aiContent.summary;
            }
            catch { }
        }
        if (summary)
            content += `**Summary:** ${summary}\n`;
        content += `\n`;
        if (options.aiEnrichment) {
            try {
                const aiContent = await ai_service_1.xaiService.generateAIContent(page.path, page.content);
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
            }
            catch (error) {
                console.warn(`⚠️ AI enrichment failed for ${page.path}:`, error);
            }
        }
        content += `## Content\n\n`;
        content += page.content;
        content += `\n\n`;
        if (options.includeLinks && page.links.length > 0) {
            content += `## Links\n\n`;
            page.links.forEach((link) => {
                content += `- ${link}\n`;
            });
            content += `\n`;
        }
        if (options.includeImages && page.images && page.images.length > 0) {
            content += `## Images\n\n`;
            page.images.forEach((image) => {
                content += `- ${image}\n`;
            });
            content += `\n`;
        }
        return content;
    }
    async generateSitemapOverview(url) {
        try {
            const pagesData = await this.extractAllPages(url, 2);
            let content = `# Site Overview\n`;
            content += `**Website:** ${url}\n`;
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Total Pages:** ${pagesData.length}\n\n`;
            content += `## Page Structure\n\n`;
            const pagesByDepth = this.groupPagesByDepth(pagesData);
            Object.entries(pagesByDepth).forEach(([depth, pages]) => {
                content += `### Depth ${depth}\n`;
                pages.forEach((page) => {
                    content += `- ${page.title} (${page.path})\n`;
                });
                content += `\n`;
            });
            return content;
        }
        catch (error) {
            console.error("❌ Sitemap overview generation failed:", error);
            return `# Site Overview\nError generating overview: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
    }
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimiter.minInterval) {
            const delay = this.rateLimiter.minInterval - timeSinceLastRequest;
            console.log(`⏱️ Rate limiting: waiting ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.rateLimiter.lastRequestTime = Date.now();
    }
    groupPagesByDepth(pages) {
        const grouped = {};
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
exports.LLMsFullService = LLMsFullService;
function estimateCrawlTime(numPages) {
    return Math.min(numPages, 1000) * 10;
}
exports.llmsFullService = new LLMsFullService();
//# sourceMappingURL=llms-full.service.js.map