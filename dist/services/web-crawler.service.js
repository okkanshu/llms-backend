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
const playwright_1 = require("playwright");
class WebCrawlerService {
    constructor() {
        this.maxPages = 1000;
        this.timeout = 10000;
        this.userAgent = "TheLLMsTxt-Crawler/1.0";
        this.browser = null;
        this.page = null;
        this.rateLimiter = {
            lastRequestTime: 0,
            requestsPerSecond: 25,
            minInterval: 1000 / 25,
        };
        this.playwrightRateLimiter = {
            lastRequestTime: 0,
            requestsPerMinute: 25,
            minInterval: 60000 / 25,
            maxConcurrentTabs: 2,
            activeTabs: 0,
        };
    }
    async extractWebsiteData(url, maxDepth = 6, signal) {
        console.log(`🕷️ Starting website extraction for: ${url}`);
        try {
            const baseUrl = this.normalizeUrl(url);
            const baseDomain = new url_1.URL(baseUrl).hostname;
            console.log(`📍 Base URL: ${baseUrl}, Domain: ${baseDomain}`);
            const discovered = new Set(), crawled = new Map(), toCrawl = [[baseUrl, 0]], scrapedUrls = [];
            let pages = 0;
            while (toCrawl.length && pages < this.maxPages) {
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
                console.log(`📄 Crawling page ${pages}/${this.maxPages}: ${cur} (depth: ${depth})`);
                try {
                    const res = await this.crawlPage(cur, baseDomain, signal);
                    crawled.set(cur, res);
                    if (res.success) {
                        console.log(`✅ Successfully crawled: ${res.path}`);
                        console.log(`   Title: "${res.metadata.title}"`);
                        console.log(`   Description: "${res.metadata.description}"`);
                        console.log(`   Body content length: ${res.metadata.bodyContent?.length || 0} chars`);
                        console.log(`   Links found: ${res.metadata.links.length}`);
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
                        console.log(`❌ Failed to crawl: ${cur} - ${res.error}`);
                    }
                }
                catch (e) {
                    const errorMsg = e instanceof Error ? e.message : "Unknown error";
                    console.log(`💥 Error crawling ${cur}: ${errorMsg}`);
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
            const uniquePaths = this.extractUniquePaths(Array.from(discovered), baseUrl);
            console.log(`🔍 Found ${uniquePaths.length} unique paths:`, uniquePaths);
            const pageMetadatas = this.createPageMetadatas(uniquePaths, crawled);
            console.log(`📊 Created metadata for ${pageMetadatas.length} pages`);
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
            console.log(`🎯 Extraction complete:`);
            console.log(`   Title: "${result.title}"`);
            console.log(`   Description: "${result.description}"`);
            console.log(`   Total pages crawled: ${result.totalPagesCrawled}`);
            console.log(`   Total links found: ${result.totalLinksFound}`);
            console.log(`   Unique paths: ${result.uniquePathsFound}`);
            return result;
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            console.log(`💥 Failed to extract website data: ${errorMsg}`);
            throw new Error(`Failed to extract website data: ${errorMsg}`);
        }
    }
    async crawlPage(url, baseDomain, signal) {
        try {
            await this.enforceRateLimit();
            console.log(`🌐 Fetching: ${url}`);
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
            console.log(`📥 Response status: ${res.status}, Content length: ${res.data.length}`);
            const $ = cheerio.load(res.data);
            const metadata = this.extractMetadata($, url, baseDomain);
            metadata.bodyContent = this.extractBodyText($);
            console.log(`📝 Extracted metadata for ${url}:`);
            console.log(`   Title: "${metadata.title}"`);
            console.log(`   Description: "${metadata.description}"`);
            console.log(`   Keywords: "${metadata.keywords}"`);
            console.log(`   Body content preview: "${metadata.bodyContent?.substring(0, 100)}..."`);
            return { url, path: this.getPathFromUrl(url), metadata, success: true };
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            console.log(`❌ Failed to crawl ${url}: ${errorMsg}`);
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
        $("a[href]").each((_, el) => {
            const href = $(el).attr("href");
            if (href) {
                try {
                    const abs = new url_1.URL(href, url).href;
                    if (new url_1.URL(abs).hostname === baseDomain)
                        links.push(abs);
                }
                catch { }
            }
        });
        console.log(`🔗 Found ${links.length} internal links on ${url}`);
        return { title, description, keywords, links: [...new Set(links)] };
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
        console.log(`📋 Creating page metadata for ${paths.length} paths`);
        return paths.map((path) => {
            const page = Array.from(crawled.values()).find((p) => p.path === path);
            const metadata = {
                path,
                title: page?.metadata.title || "",
                description: page?.metadata.description || "",
                keywords: page?.metadata.keywords || "",
                bodyContent: page?.metadata.bodyContent || "",
            };
            console.log(`📄 Metadata for ${path}:`);
            console.log(`   Title: "${metadata.title}"`);
            console.log(`   Description: "${metadata.description}"`);
            console.log(`   Body content length: ${metadata.bodyContent.length} chars`);
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
        console.log(`🔄 Converting ${paths.length} paths to PathSelection objects`);
        return paths.map((path) => {
            const selection = {
                path,
                allow: true,
                description: this.generatePathDescription(path),
            };
            console.log(`   ${path} -> "${selection.description}"`);
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
        console.log(`📚 Starting LLMs Full generation for: ${websiteUrl}`);
        try {
            const baseUrl = this.normalizeUrl(websiteUrl), baseDomain = new url_1.URL(baseUrl).hostname, timestamp = new Date().toISOString();
            console.log(`📍 Base URL: ${baseUrl}, Domain: ${baseDomain}`);
            const discovered = new Set(), crawled = new Map(), toCrawl = [[baseUrl, 0]], scrapedUrls = [];
            let pages = 0;
            while (toCrawl.length && pages < this.maxPages) {
                const [cur, depth] = toCrawl.shift();
                if (discovered.has(cur) || depth > maxDepth)
                    continue;
                discovered.add(cur);
                scrapedUrls.push(cur);
                pages++;
                console.log(`📄 LLMs Full - Crawling page ${pages}/${this.maxPages}: ${cur} (depth: ${depth})`);
                try {
                    const res = await this.crawlPage(cur, baseDomain);
                    crawled.set(cur, res);
                    if (res.success) {
                        console.log(`✅ LLMs Full - Successfully crawled: ${res.path}`);
                        console.log(`   Title: "${res.metadata.title}"`);
                        console.log(`   Body content length: ${res.metadata.bodyContent?.length || 0} chars`);
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
                        console.log(`❌ LLMs Full - Failed to crawl: ${cur} - ${res.error}`);
                    }
                }
                catch { }
                await new Promise((r) => setTimeout(r, 500));
            }
            const allPages = [];
            console.log(`📋 Processing ${crawled.size} crawled pages for LLMs Full`);
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
                console.log(`📄 LLMs Full - Page: ${page.path}`);
                console.log(`   Title: "${page.title}"`);
                console.log(`   Body content length: ${bodyContent.length} chars`);
                console.log(`   Body preview: "${bodyContent.substring(0, 100)}..."`);
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
            console.log(`📚 LLMs Full generation complete:`);
            console.log(`   Total pages: ${allPages.length}`);
            console.log(`   Total words: ${totalWords}`);
            console.log(`   Content length: ${content.length} chars`);
            return { content, totalPages: allPages.length, totalWords };
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            console.log(`💥 Failed to generate llms-full.txt: ${errorMsg}`);
            throw new Error(`Failed to generate llms-full.txt: ${errorMsg}`);
        }
    }
    extractBodyText($) {
        console.log(`🧹 Cleaning HTML for body text extraction`);
        $("script, style, noscript, iframe, svg").remove();
        const bodyText = $("body").text();
        console.log(`📝 Raw body text length: ${bodyText.length} chars`);
        const cleanedText = bodyText
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        const finalText = cleanedText.slice(0, 30000);
        console.log(`✨ Cleaned body text length: ${finalText.length} chars`);
        console.log(`📖 Body text preview: "${finalText.substring(0, 100)}..."`);
        return finalText;
    }
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async getPlaywrightBrowser() {
        if (!this.browser) {
            console.log(`🚀 Initializing Playwright browser...`);
            this.browser = await playwright_1.chromium.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        }
        return this.browser;
    }
    async getPlaywrightPage() {
        if (this.playwrightRateLimiter.activeTabs >=
            this.playwrightRateLimiter.maxConcurrentTabs) {
            console.log(`⏱️ Playwright rate limiting: waiting for available tab slot`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return this.getPlaywrightPage();
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
    async scrapePage(url) {
        console.log(`🌐 Starting enhanced scraping for: ${url}`);
        try {
            console.log(`⚡ Attempting Cheerio scraping...`);
            const cheerioResult = await this.scrapeWithCheerio(url);
            const isContentSufficient = this.isContentSufficient(cheerioResult);
            if (isContentSufficient) {
                console.log(`✅ Cheerio scraping successful - content sufficient`);
                return cheerioResult;
            }
            console.log(`⚠️ [warning] Falling back to Playwright: heavy page detected`);
            console.log(`🎭 Attempting Playwright scraping...`);
            const delayMs = Math.floor(Math.random() * 3000) + 2000;
            console.log(`⏱️ Adding ${delayMs}ms delay for rate limiting...`);
            await this.delay(delayMs);
            const playwrightResult = await this.scrapeWithPlaywright(url);
            console.log(`✅ Playwright scraping completed`);
            return playwrightResult;
        }
        catch (error) {
            console.log(`❌ Enhanced scraping failed: ${error}`);
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
    async scrapeWithPlaywright(url) {
        await this.enforcePlaywrightRateLimit();
        const page = await this.getPlaywrightPage();
        try {
            await page.goto(url, {
                waitUntil: "networkidle",
                timeout: this.timeout,
            });
            await page.waitForTimeout(2000);
            const title = await page.evaluate(() => {
                const titleEl = document.querySelector("title");
                const h1El = document.querySelector("h1");
                const ogTitleEl = document.querySelector('meta[property="og:title"]');
                return (titleEl?.textContent?.trim() ||
                    h1El?.textContent?.trim() ||
                    ogTitleEl?.getAttribute("content") ||
                    "");
            });
            const description = await page.evaluate(() => {
                const descEl = document.querySelector('meta[name="description"]');
                const ogDescEl = document.querySelector('meta[property="og:description"]');
                const firstP = document.querySelector("p");
                return (descEl?.getAttribute("content") ||
                    ogDescEl?.getAttribute("content") ||
                    firstP?.textContent?.trim().substring(0, 160) ||
                    "");
            });
            const keywords = await page.evaluate(() => {
                const keywordsEl = document.querySelector('meta[name="keywords"]');
                return keywordsEl?.getAttribute("content") || "";
            });
            const bodySnippet = await page.evaluate(() => {
                const elementsToRemove = document.querySelectorAll("script, style, noscript, iframe, svg");
                elementsToRemove.forEach((el) => el.remove());
                const bodyText = document.body?.textContent || "";
                const cleanedText = bodyText
                    .replace(/[ \t]+/g, " ")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                return cleanedText.slice(0, 30000);
            });
            return { title, description, keywords, bodySnippet };
        }
        catch (error) {
            console.log(`❌ Playwright scraping failed: ${error}`);
            return {
                title: "",
                description: "",
                keywords: "",
                bodySnippet: "",
            };
        }
        finally {
            this.playwrightRateLimiter.activeTabs = Math.max(0, this.playwrightRateLimiter.activeTabs - 1);
        }
    }
    isContentSufficient(result) {
        const hasTitle = result.title.length > 0;
        const hasDescription = result.description.length > 0;
        const hasBodyContent = result.bodySnippet.length >= 1000;
        const needsFallback = !hasTitle && !hasDescription && !hasBodyContent;
        console.log(`🔍 Content sufficiency check:`);
        console.log(`   Title: ${hasTitle ? "✅" : "❌"} (${result.title.length} chars)`);
        console.log(`   Description: ${hasDescription ? "✅" : "❌"} (${result.description.length} chars)`);
        console.log(`   Body content: ${hasBodyContent ? "✅" : "❌"} (${result.bodySnippet.length} chars)`);
        console.log(`   Needs fallback: ${needsFallback ? "Yes" : "No"}`);
        return !needsFallback;
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
    async enforcePlaywrightRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.playwrightRateLimiter.lastRequestTime;
        if (timeSinceLastRequest < this.playwrightRateLimiter.minInterval) {
            const delay = this.playwrightRateLimiter.minInterval - timeSinceLastRequest;
            console.log(`⏱️ Playwright rate limiting: waiting ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const randomDelay = Math.floor(Math.random() * 4000) + 2000;
        console.log(`⏱️ Playwright random delay: ${randomDelay}ms`);
        await new Promise((resolve) => setTimeout(resolve, randomDelay));
        this.playwrightRateLimiter.lastRequestTime = Date.now();
    }
    async cleanup() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
exports.WebCrawlerService = WebCrawlerService;
exports.webCrawlerService = new WebCrawlerService();
//# sourceMappingURL=web-crawler.service.js.map