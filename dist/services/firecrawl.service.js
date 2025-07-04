"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractWebsiteData = exports.firecrawlService = exports.FirecrawlService = void 0;
const firecrawl_js_1 = __importDefault(require("@mendable/firecrawl-js"));
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const websiteDataSchema = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    keywords: zod_1.z.string().optional(),
    links: zod_1.z.array(zod_1.z.string()),
});
class FirecrawlService {
    constructor() {
        this.apiKey = "fc-55931a898b814c2084cf786e41b60260";
        this.app = new firecrawl_js_1.default({
            apiKey: this.apiKey,
        });
    }
    async extractWebsiteData(url) {
        if (!this.apiKey) {
            console.error("❌ Missing Firecrawl API key");
            throw new Error("FIRECRAWL_API_KEY is required in environment variables");
        }
        try {
            console.log(`🔍 Starting comprehensive extraction for URL: ${url}`);
            console.log(`🔑 Using API key: ${this.apiKey.substring(0, 10)}...`);
            const tempAllLinks = [];
            const tempPageData = [];
            const tempDuplicateTracker = new Set();
            console.log("🕷️ Starting website crawl to discover pages...");
            const crawlResult = (await this.app.crawlUrl(url, {
                limit: 70,
                scrapeOptions: {
                    formats: ["markdown", "html"],
                },
            }));
            console.log("📊 Crawl completed:", {
                success: crawlResult.success,
                status: crawlResult.status,
            });
            if (!crawlResult.success) {
                console.error("❌ Crawl failed:", crawlResult.error);
                throw new Error(`Crawl failed: ${crawlResult.error}`);
            }
            if (!crawlResult.data || !Array.isArray(crawlResult.data)) {
                console.error("❌ No crawl data available");
                throw new Error("No crawl data available");
            }
            console.log("📊 Crawl data available:", {
                totalPages: crawlResult.data.length,
                status: crawlResult.status,
            });
            console.log("🔍 Extracting data from discovered pages...");
            let mainPageData = null;
            for (const page of crawlResult.data) {
                const pageUrl = page.metadata?.sourceURL || page.metadata?.url;
                if (!pageUrl)
                    continue;
                console.log(`📄 Processing page: ${pageUrl}`);
                try {
                    const extractResult = (await this.app.extract([pageUrl], {
                        prompt: "Extract the title, description, keywords, and all internal links from this page. Return as JSON with fields: title, description, keywords, links (array of internal URLs).",
                        schema: websiteDataSchema,
                    }));
                    if (extractResult.success && extractResult.data) {
                        const extractedData = extractResult.data;
                        tempPageData.push({
                            url: pageUrl,
                            title: extractedData.title,
                            description: extractedData.description,
                            keywords: extractedData.keywords,
                            links: extractedData.links || [],
                        });
                        if (!mainPageData && (pageUrl === url || pageUrl.endsWith("/"))) {
                            mainPageData = extractedData;
                        }
                        if (extractedData.links && Array.isArray(extractedData.links)) {
                            extractedData.links.forEach((link) => {
                                tempAllLinks.push(link);
                                tempDuplicateTracker.add(link);
                            });
                        }
                        console.log(`✅ Extracted from ${pageUrl}:`, {
                            title: extractedData.title,
                            linksCount: extractedData.links?.length || 0,
                            uniqueLinksInPage: new Set(extractedData.links || []).size,
                        });
                    }
                }
                catch (extractError) {
                    console.warn(`⚠️ Failed to extract from ${pageUrl}:`, extractError);
                }
            }
            console.log("🎯 Extracting from main URL for comprehensive data...");
            const mainExtractResult = (await this.app.extract([url], {
                prompt: "Extract the title, description, keywords, and all internal links from this page. Return as JSON with fields: title, description, keywords, links (array of internal URLs).",
                schema: websiteDataSchema,
            }));
            if (mainExtractResult.success && mainExtractResult.data) {
                const mainData = mainExtractResult.data;
                if (!mainPageData) {
                    mainPageData = mainData;
                }
                if (mainData.links && Array.isArray(mainData.links)) {
                    mainData.links.forEach((link) => {
                        tempAllLinks.push(link);
                        tempDuplicateTracker.add(link);
                    });
                }
                console.log("📋 Main page extracted data:", {
                    title: mainData.title,
                    description: mainData.description?.substring(0, 200) + "...",
                    linksCount: mainData.links?.length || 0,
                });
            }
            const uniqueLinks = [...new Set(tempAllLinks)];
            console.log(`🔗 Found ${uniqueLinks.length} unique links across all pages (${tempAllLinks.length} total, ${tempAllLinks.length - uniqueLinks.length} duplicates removed)`);
            const uniquePaths = this.extractUniquePaths(uniqueLinks, url);
            console.log(`✅ Filtered to ${uniquePaths.length} unique internal paths`);
            const pageMetadatas = uniquePaths.map((path) => {
                const match = tempPageData.find((p) => p.links.includes(path)) || tempPageData[0];
                return {
                    path,
                    title: match?.title || "",
                    description: match?.description || "",
                    keywords: match?.keywords || "",
                };
            });
            const websiteData = {
                title: mainPageData?.title || "Untitled",
                description: mainPageData?.description || "No description available",
                paths: uniquePaths,
                totalPagesCrawled: crawlResult.data.length,
                totalLinksFound: tempAllLinks.length,
                uniquePathsFound: uniquePaths.length,
                pageMetadatas,
            };
            console.log(`✅ Successfully extracted comprehensive website data from ${url}:`, {
                title: websiteData.title,
                descriptionLength: websiteData.description.length,
                pathsCount: websiteData.paths.length,
                pagesCrawled: websiteData.totalPagesCrawled,
                totalLinksFound: websiteData.totalLinksFound,
                uniquePathsFound: websiteData.uniquePathsFound,
                duplicateLinksRemoved: websiteData.totalLinksFound - uniqueLinks.length,
            });
            return websiteData;
        }
        catch (error) {
            console.error("❌ Firecrawl extraction failed with error:", {
                message: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : undefined,
                url: url,
                apiKey: this.apiKey ? "Present" : "Missing",
            });
            if (error instanceof Error) {
                if (error.message.includes("API key")) {
                    console.error("🔑 API Key Error - Check if the API key is valid and has proper permissions");
                }
                else if (error.message.includes("rate limit")) {
                    console.error("⏱️ Rate Limit Error - Consider implementing retry logic with exponential backoff");
                }
                else if (error.message.includes("timeout")) {
                    console.error("⏰ Timeout Error - The website might be too large or slow to process");
                }
                else if (error.message.includes("network")) {
                    console.error("🌐 Network Error - Check internet connection and Firecrawl service status");
                }
            }
            throw new Error(`Failed to extract website data: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    extractUniquePaths(paths, baseUrl) {
        try {
            const baseUrlObj = new URL(baseUrl);
            const baseDomain = baseUrlObj.hostname;
            const uniquePaths = new Set();
            paths.forEach((path) => {
                try {
                    const url = new URL(path, baseUrl);
                    if (url.hostname === baseDomain) {
                        let normalizedPath = url.pathname;
                        if (normalizedPath.endsWith("/") && normalizedPath !== "/") {
                            normalizedPath = normalizedPath.slice(0, -1);
                        }
                        if (url.search) {
                            normalizedPath += url.search;
                        }
                        if (url.hash) {
                            normalizedPath += url.hash;
                        }
                        uniquePaths.add(normalizedPath);
                    }
                }
                catch (urlError) {
                    console.warn(`Skipping invalid URL: ${path}`);
                }
            });
            return Array.from(uniquePaths).sort();
        }
        catch (error) {
            console.error("Error extracting unique paths:", error);
            return [];
        }
    }
    convertToPathSelections(paths) {
        return paths.map((path) => ({
            path,
            allow: true,
            description: this.generatePathDescription(path),
        }));
    }
    generatePathDescription(path) {
        const pathLower = path.toLowerCase();
        if (path === "/")
            return "Homepage";
        if (pathLower.includes("/blog") || pathLower.includes("/news"))
            return "Blog/News";
        if (pathLower.includes("/about"))
            return "About page";
        if (pathLower.includes("/contact"))
            return "Contact page";
        if (pathLower.includes("/privacy"))
            return "Privacy policy";
        if (pathLower.includes("/terms"))
            return "Terms of service";
        if (pathLower.includes("/api"))
            return "API endpoint";
        if (pathLower.includes("/admin"))
            return "Admin panel";
        if (pathLower.includes("/login") || pathLower.includes("/signin"))
            return "Authentication";
        if (pathLower.includes("/product") || pathLower.includes("/service"))
            return "Product/Service page";
        if (pathLower.includes("/help") || pathLower.includes("/support"))
            return "Help/Support";
        if (pathLower.includes("/faq"))
            return "FAQ page";
        const pathParts = path.split("/").filter((part) => part.length > 0);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart) {
                const cleanName = lastPart
                    .replace(/\.(html|htm|php|asp|aspx)$/i, "")
                    .replace(/[-_]/g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase());
                return cleanName || "Page";
            }
        }
        return "Page";
    }
}
exports.FirecrawlService = FirecrawlService;
exports.firecrawlService = new FirecrawlService();
const extractWebsiteData = (url) => exports.firecrawlService.extractWebsiteData(url);
exports.extractWebsiteData = extractWebsiteData;
//# sourceMappingURL=firecrawl.service.js.map