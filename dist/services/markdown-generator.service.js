"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownGeneratorService = exports.MarkdownGeneratorService = void 0;
const ai_service_1 = require("./ai.service");
const web_crawler_service_1 = require("./web-crawler.service");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class MarkdownGeneratorService {
    constructor() {
        this.rateLimiter = {
            lastRequestTime: 0,
            requestsPerSecond: 25,
            minInterval: 1000 / 25,
        };
    }
    async generateMarkdownPages(websiteUrl, signal) {
        try {
            console.log(`📝 Starting markdown generation for: ${websiteUrl}`);
            const keyPages = await this.extractKeyPages(websiteUrl, signal);
            const files = await this.generateMarkdownFiles(keyPages, websiteUrl);
            console.log(`✅ Markdown generation completed:`, {
                totalFiles: files.length,
                websiteUrl,
            });
            return {
                success: true,
                files,
            };
        }
        catch (error) {
            console.error("❌ Markdown generation failed:", error);
            return {
                success: false,
                files: [],
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async extractKeyPages(websiteUrl, signal) {
        console.log(`🔍 Extracting key pages from: ${websiteUrl}`);
        try {
            const websiteData = await web_crawler_service_1.webCrawlerService.extractWebsiteData(websiteUrl, 6, signal);
            const keyPages = [];
            const priorityPaths = this.getPriorityPaths();
            for (const metadata of websiteData.pageMetadatas) {
                const path = metadata.path;
                if (this.shouldIncludePage(path, priorityPaths)) {
                    try {
                        const markdownPage = {
                            path: metadata.path,
                            title: metadata.title || path,
                            content: "",
                            metadata: {
                                description: metadata.description,
                                keywords: metadata.keywords
                                    ? metadata.keywords.split(",").map((k) => k.trim())
                                    : undefined,
                                lastModified: new Date().toISOString(),
                            },
                        };
                        keyPages.push(markdownPage);
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract markdown from ${path}:`, error);
                    }
                }
            }
            for (const page of keyPages) {
                if (signal?.aborted) {
                    console.log("🛑 Markdown generation cancelled by user");
                    throw new Error("CANCELLED");
                }
                try {
                    await this.enforceRateLimit();
                    const fullUrl = new URL(page.path, websiteUrl).href;
                    const content = await this.extractPageContent(fullUrl, signal);
                    page.content = content;
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract content from ${page.path}:`, error);
                    page.content = `# ${page.title}\n\nContent not available.`;
                }
            }
            return keyPages;
        }
        catch (error) {
            console.error("❌ Failed to extract key pages:", error);
            throw new Error("Failed to crawl website for markdown generation");
        }
    }
    getPriorityPaths() {
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
    shouldIncludePage(path, priorityPaths) {
        if (priorityPaths.includes(path)) {
            return true;
        }
        const pathSegments = path.split("/").filter(Boolean);
        if (pathSegments.length > 2) {
            return false;
        }
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
    async extractPageContent(url, signal) {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "TheLLMsTxt-Crawler/1.0",
                },
                signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const html = await response.text();
            return this.htmlToMarkdown(html);
        }
        catch (error) {
            console.warn(`⚠️ Failed to extract content from ${url}:`, error);
            return `# Page Content\n\nContent extraction failed.`;
        }
    }
    htmlToMarkdown(html) {
        let markdown = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n")
            .replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n")
            .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
            .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
            .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
            .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
            .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
            return content.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n") + "\n";
        })
            .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
            let counter = 1;
            return (content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`) + "\n");
        })
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ");
        return markdown.trim();
    }
    async generateMarkdownFiles(pages, websiteUrl) {
        const files = [];
        for (const page of pages) {
            try {
                const markdownContent = await this.generateSingleMarkdownFile(page, websiteUrl);
                const filename = this.generateFilename(page.path);
                files.push({
                    path: page.path,
                    content: markdownContent,
                    filename,
                });
            }
            catch (error) {
                console.warn(`⚠️ Failed to generate markdown for ${page.path}:`, error);
            }
        }
        return files;
    }
    async generateSingleMarkdownFile(page, websiteUrl) {
        let content = `# ${page.title}\n\n`;
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
        let summary = page.summary;
        if (!summary) {
            try {
                const aiContent = await ai_service_1.xaiService.generateAIContent(page.path, page.content);
                summary = aiContent.summary;
            }
            catch { }
        }
        if (summary &&
            !summary.includes("not available") &&
            !summary.includes("failed")) {
            content += `**Summary:** ${summary}\n`;
        }
        content += `\n---\n\n`;
        content += `## Content\n\n${page.content}\n`;
        return content;
    }
    generateFilename(path) {
        let filename = path
            .replace(/^\//, "")
            .replace(/\/$/, "")
            .replace(/\//g, "-")
            .replace(/[^a-zA-Z0-9\-_]/g, "")
            .toLowerCase();
        if (!filename) {
            filename = "index";
        }
        return `${filename}.md`;
    }
    async generateMarkdownSitemap(websiteUrl) {
        try {
            const pages = await this.extractKeyPages(websiteUrl);
            let content = `# Site Map\n\n`;
            content += `**Website:** ${websiteUrl}\n`;
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Total Pages:** ${pages.length}\n\n`;
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
        }
        catch (error) {
            console.error("❌ Markdown sitemap generation failed:", error);
            return `# Site Map\nError generating sitemap: ${error instanceof Error ? error.message : "Unknown error"}`;
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
    groupPagesBySection(pages) {
        const sections = {
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
            }
            else if (path.includes("about") ||
                path.includes("contact") ||
                path.includes("team")) {
                sections["About & Contact"].push(page);
            }
            else if (path.includes("blog") ||
                path.includes("docs") ||
                path.includes("projects") ||
                path.includes("services") ||
                path.includes("products")) {
                sections["Content"].push(page);
            }
            else if (path.includes("privacy") ||
                path.includes("terms") ||
                path.includes("legal")) {
                sections["Legal"].push(page);
            }
            else {
                sections["Other"].push(page);
            }
        });
        Object.keys(sections).forEach((section) => {
            if (sections[section].length === 0) {
                delete sections[section];
            }
        });
        return sections;
    }
}
exports.MarkdownGeneratorService = MarkdownGeneratorService;
exports.markdownGeneratorService = new MarkdownGeneratorService();
//# sourceMappingURL=markdown-generator.service.js.map