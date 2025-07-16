"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webCrawlerService = exports.WebCrawlerService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const url_1 = require("url");
class WebCrawlerService {
    constructor() {
        this.maxPages = 1000;
        this.timeout = 10000;
        this.userAgent = "TheLLMsTxt-Crawler/1.0";
        this.rateLimiter = {
            lastRequestTime: 0,
            requestsPerSecond: 25,
            minInterval: 1000 / 25,
        };
    }
    async extractWebsiteData(url, maxDepth = 6, signal, maxPagesOverride, onProgress) {
        console.log(`🕷️ Starting website extraction for: ${url}`);
        try {
            const baseUrl = this.normalizeUrl(url);
            const baseDomain = new url_1.URL(baseUrl).hostname;
            const discovered = new Set(), crawled = new Map(), toCrawl = [[baseUrl, 0]], scrapedUrls = [];
            let pages = 0;
            const maxPages = typeof maxPagesOverride === "number" ? maxPagesOverride : this.maxPages;
            console.log(`🎯 Crawler initialized with maxPages: ${maxPages}, maxDepth: ${maxDepth}`);
            console.log(`🎯 Starting URL: ${baseUrl}, Domain: ${baseDomain}`);
            while (toCrawl.length && pages < maxPages) {
                if (signal?.aborted) {
                    console.log("🛑 Website extraction cancelled by user");
                    throw new Error("CANCELLED");
                }
                const [cur, depth] = toCrawl.shift();
                if (discovered.has(cur) || depth > maxDepth)
                    continue;
                discovered.add(cur);
                scrapedUrls.push(cur);
                pages++;
                if (onProgress)
                    onProgress(pages);
                try {
                    const res = await this.crawlPage(cur, baseDomain, signal);
                    crawled.set(cur, res);
                    if (res.success) {
                        if (res.metadata.links) {
                            let addedLinks = 0;
                            for (const link of res.metadata.links) {
                                try {
                                    const abs = new url_1.URL(link, baseUrl).href;
                                    if (new url_1.URL(abs).hostname === baseDomain &&
                                        !discovered.has(abs) &&
                                        !scrapedUrls.includes(abs)) {
                                        toCrawl.push([abs, depth + 1]);
                                        addedLinks++;
                                    }
                                }
                                catch { }
                            }
                        }
                    }
                    else {
                    }
                }
                catch (e) {
                    const errorMsg = e instanceof Error ? e.message : "Unknown error";
                    crawled.set(cur, {
                        url: cur,
                        path: this.getPathFromUrl(cur),
                        metadata: {
                            title: "",
                            description: "",
                            links: [],
                            bodyContent: "",
                        },
                        success: false,
                        error: errorMsg,
                    });
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            console.log(`🏁 Crawling finished. Pages crawled: ${pages}, Queue empty: ${toCrawl.length === 0}, Max pages reached: ${pages >= maxPages}`);
            const uniquePaths = this.extractUniquePaths(Array.from(discovered), baseUrl);
            const pageMetadatas = this.createPageMetadatas(uniquePaths, crawled);
            const main = crawled.get(baseUrl);
            const result = {
                title: main?.metadata.title || "Untitled",
                description: main?.metadata.description || "No description available",
                paths: uniquePaths,
                totalPagesCrawled: pages,
                totalLinksFound: this.countTotalLinks(crawled),
                uniquePathsFound: uniquePaths.length,
                pageMetadatas,
            };
            return result;
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            throw new Error(`Failed to extract website data: ${errorMsg}`);
        }
    }
    async crawlPage(url, baseDomain, signal) {
        try {
            await this.enforceRateLimit();
            const startTime = Date.now();
            const res = await axios_1.default.get(url, {
                timeout: this.timeout,
                headers: {
                    "User-Agent": this.userAgent,
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate",
                    Connection: "keep-alive",
                },
                maxRedirects: 5,
                signal,
            });
            const fetchTime = Date.now() - startTime;
            const $ = cheerio.load(res.data);
            const metadata = this.extractMetadata($, url, baseDomain);
            metadata.bodyContent = this.extractBodyText($);
            return { url, path: this.getPathFromUrl(url), metadata, success: true };
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            return {
                url,
                path: this.getPathFromUrl(url),
                metadata: { title: "", description: "", links: [], bodyContent: "" },
                success: false,
                error: errorMsg,
            };
        }
    }
    extractMetadata($, url, baseDomain) {
        const title = $("title").text().trim() ||
            $("h1").first().text().trim() ||
            $('meta[property="og:title"]').attr("content") ||
            "";
        const description = $('meta[name="description"]').attr("content") ||
            $('meta[property="og:description"]').attr("content") ||
            $("p").first().text().trim().substring(0, 160) ||
            "";
        const keywords = $('meta[name="keywords"]').attr("content") || "";
        const links = [];
        let totalLinks = 0;
        $("a[href]").each((_, el) => {
            totalLinks++;
            const href = $(el).attr("href");
            if (href) {
                try {
                    const abs = new url_1.URL(href, url).href;
                    if (new url_1.URL(abs).hostname === baseDomain) {
                        links.push(abs);
                    }
                    else {
                    }
                }
                catch (error) {
                    console.log(`🔗 Invalid link: ${href} (error: ${error})`);
                }
            }
        });
        return {
            title,
            description,
            keywords: keywords || "",
            links: [...new Set(links)],
        };
    }
    normalizeUrl(url) {
        return !url.startsWith("http://") && !url.startsWith("https://")
            ? `https://${url}`
            : url;
    }
    getPathFromUrl(url) {
        try {
            const u = new url_1.URL(url);
            let path = u.pathname;
            if (path.endsWith("/") && path !== "/")
                path = path.slice(0, -1);
            if (u.search)
                path += u.search;
            if (u.hash)
                path += u.hash;
            return path || "/";
        }
        catch {
            return "/";
        }
    }
    extractUniquePaths(urls, baseUrl) {
        const baseDomain = new url_1.URL(baseUrl).hostname, unique = new Set();
        urls.forEach((url) => {
            try {
                const u = new url_1.URL(url);
                if (u.hostname === baseDomain)
                    unique.add(this.getPathFromUrl(url));
            }
            catch { }
        });
        return Array.from(unique).sort();
    }
    createPageMetadatas(paths, crawled) {
        return paths.map((path) => {
            const page = Array.from(crawled.values()).find((p) => p.path === path);
            const metadata = {
                path,
                title: page?.metadata.title || "",
                description: page?.metadata.description || "",
                keywords: typeof page?.metadata.keywords === "string"
                    ? page.metadata.keywords
                    : "",
                bodyContent: page?.metadata.bodyContent || "",
            };
            return metadata;
        });
    }
    countTotalLinks(crawled) {
        let total = 0;
        for (const page of crawled.values())
            if (page.success && page.metadata.links)
                total += page.metadata.links.length;
        return total;
    }
    convertToPathSelections(paths) {
        return paths.map((path) => {
            const selection = {
                path,
                allow: true,
                description: this.generatePathDescription(path),
            };
            return selection;
        });
    }
    generatePathDescription(path) {
        const l = path.toLowerCase();
        if (path === "/")
            return "Homepage";
        if (l.includes("/blog") || l.includes("/news"))
            return "Blog/News";
        if (l.includes("/about"))
            return "About page";
        if (l.includes("/contact"))
            return "Contact page";
        if (l.includes("/privacy"))
            return "Privacy policy";
        if (l.includes("/terms"))
            return "Terms of service";
        if (l.includes("/api"))
            return "API endpoint";
        if (l.includes("/admin"))
            return "Admin panel";
        if (l.includes("/login") || l.includes("/signin"))
            return "Authentication";
        if (l.includes("/product") || l.includes("/service"))
            return "Product/Service page";
        if (l.includes("/help") || l.includes("/support"))
            return "Help/Support";
        if (l.includes("/faq"))
            return "FAQ page";
        const parts = path.split("/").filter(Boolean);
        if (parts.length) {
            const last = parts[parts.length - 1];
            if (last)
                return (last
                    .replace(/\.(html|htm|php|asp|aspx)$/i, "")
                    .replace(/[-_]/g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase()) || "Page");
        }
        return "Page";
    }
    async generateLLMsFull(websiteUrl, maxDepth = 6) {
        try {
            const baseUrl = this.normalizeUrl(websiteUrl), baseDomain = new url_1.URL(baseUrl).hostname, timestamp = new Date().toISOString();
            const discovered = new Set(), crawled = new Map(), toCrawl = [[baseUrl, 0]], scrapedUrls = [];
            let pages = 0;
            while (toCrawl.length && pages < this.maxPages) {
                const [cur, depth] = toCrawl.shift();
                if (discovered.has(cur) || depth > maxDepth)
                    continue;
                discovered.add(cur);
                scrapedUrls.push(cur);
                pages++;
                try {
                    const res = await this.crawlPage(cur, baseDomain);
                    crawled.set(cur, res);
                    if (res.success) {
                        if (res.metadata.links) {
                            for (const link of res.metadata.links) {
                                try {
                                    const abs = new url_1.URL(link, baseUrl).href;
                                    if (new url_1.URL(abs).hostname === baseDomain &&
                                        !discovered.has(abs) &&
                                        !scrapedUrls.includes(abs))
                                        toCrawl.push([abs, depth + 1]);
                                }
                                catch { }
                            }
                        }
                    }
                    else {
                    }
                }
                catch { }
                await new Promise((r) => setTimeout(r, 500));
            }
            const allPages = [];
            for (const [url, crawlResult] of crawled.entries()) {
                let bodyContent = crawlResult.metadata.bodyContent || "";
                const page = {
                    url,
                    path: crawlResult.path,
                    title: crawlResult.metadata.title || "Untitled",
                    description: crawlResult.metadata.description || "No description available",
                    keywords: crawlResult.metadata.keywords || "",
                    bodyContent,
                };
                allPages.push(page);
            }
            let content = `# LLMs Full Site Content\n# Generated: ${timestamp}\n# Total Pages: ${allPages.length}\n# AI Enrichment: Disabled\n\n## Table of Contents\n`;
            allPages.forEach((p, i) => {
                content += `${i + 1}. [${p.title} - ${baseDomain}](${p.url})\n`;
            });
            content += `\n`;
            let totalWords = 0;
            allPages.forEach((page) => {
                content += `# ${page.title}\n**Path:** ${page.path}\n**URL:** ${page.url}\n**Last Modified:** ${timestamp}\n**Description:** ${page.description}\n**Keywords:** ${page.keywords || "None"}\n\n## Content\n\n${page.bodyContent}${page.bodyContent.length === 30000 ? "..." : ""}\n\n---\n\n`;
                totalWords += page.bodyContent.split(/\s+/).length;
            });
            return { content, totalPages: allPages.length, totalWords };
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            throw new Error(`Failed to generate llms-full.txt: ${errorMsg}`);
        }
    }
    extractBodyText($) {
        $("script, style, noscript, iframe, svg").remove();
        const bodyText = $("body").text();
        const cleanedText = bodyText
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        const finalText = cleanedText.slice(0, 30000);
        return finalText;
    }
    async scrapePage(url) {
        try {
            const cheerioResult = await this.scrapeWithCheerio(url);
            return cheerioResult;
        }
        catch (error) {
            return {
                title: "",
                description: "",
                keywords: "",
                bodySnippet: "",
            };
        }
    }
    async scrapeWithCheerio(url) {
        await this.enforceRateLimit();
        const res = await axios_1.default.get(url, {
            timeout: this.timeout,
            headers: {
                "User-Agent": this.userAgent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate",
                Connection: "keep-alive",
            },
            maxRedirects: 5,
        });
        const $ = cheerio.load(res.data);
        const title = $("title").text().trim() ||
            $("h1").first().text().trim() ||
            $('meta[property="og:title"]').attr("content") ||
            "";
        const description = $('meta[name="description"]').attr("content") ||
            $('meta[property="og:description"]').attr("content") ||
            $("p").first().text().trim().substring(0, 160) ||
            "";
        const keywords = $('meta[name="keywords"]').attr("content") || "";
        $("script, style, noscript, iframe, svg").remove();
        const bodyText = $("body").text();
        const cleanedText = bodyText
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        const bodySnippet = cleanedText.slice(0, 30000);
        return { title, description, keywords, bodySnippet };
    }
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimiter.minInterval) {
            const delay = this.rateLimiter.minInterval - timeSinceLastRequest;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.rateLimiter.lastRequestTime = Date.now();
    }
}
exports.WebCrawlerService = WebCrawlerService;
exports.webCrawlerService = new WebCrawlerService();
//# sourceMappingURL=web-crawler.service.js.map